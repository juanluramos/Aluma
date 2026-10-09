import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/config/prisma.js';
import { JWT_SECRET } from '../src/config/jwt.js';
import { SESSION_IDLE_MS, FRONTEND_ORIGIN } from '../src/config/session.js';
import authRoutes from '../src/routes/auth/routes.js';
import dashboardRoutes from '../src/routes/dashboard/routes.js';
import { requestId } from '../src/middlewares/request-id.middleware.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';

test('Sesiones JWT deslizantes: HTTP, cookies y MariaDB', async t => {
  const baseTime = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now: baseTime });
  const app = express(); app.use(requestId); app.use(express.json());
  app.use('/api/auth', authRoutes); app.use('/api/dashboard', dashboardRoutes); app.use(errorMiddleware);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api`;
  const marker = `ses-${randomUUID().slice(0, 8)}`;
  const requests: string[] = [];
  let userId: number | undefined;
  async function request(path: string, options: RequestInit = {}) {
    const response = await fetch(base + path, options);
    const id = response.headers.get('x-request-id'); if (id) requests.push(id);
    return { status: response.status, headers: response.headers, body: response.status === 204 ? null : await response.json() };
  }
  async function login() {
    const result = await request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${marker}@example.test`, password: 'Test-only-password!' }) });
    assert.equal(result.status, 200);
    const setCookie = result.headers.get('set-cookie')!;
    assert(setCookie.includes('HttpOnly')); assert(setCookie.includes('SameSite=Lax')); assert(setCookie.includes('Path=/api/auth'));
    assert(!('refreshToken' in result.body));
    assert.equal(result.headers.get('cache-control'), 'no-store');
    const cookie = setCookie.split(';')[0]!;
    const payload = jwt.decode(result.body.token) as jwt.JwtPayload;
    assert.equal(payload.exp! - payload.iat!, 900);
    return { ...result, cookie, sid: payload.sid as string, token: result.body.token as string };
  }
  const me = (token: string) => request('/auth/me', { headers: { Authorization: `Bearer ${token}` } });
  const refresh = (cookie: string, activity = true, extra: Record<string, string> = {}) => request('/auth/refresh', { method: 'POST', headers: { Cookie: cookie, 'X-Aluma-Session': '1', 'X-Aluma-Activity': activity ? '1' : '0', ...extra } });
  try {
    const state = await prisma.estadoUsuario.findFirstOrThrow({ where: { permiteLogin: true } });
    const document = await prisma.tipoDocumentoIdentificacion.findFirstOrThrow();
    const role = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: 'Usuario' } });
    const user = await prisma.usuario.create({ data: { nombre: marker, numeroDocumento: marker, email: `${marker}@example.test`, id_tipo_documento: document.id_tipo_documento, id_rol: role.id_rol, id_estado_usuario: state.id_estado_usuario, socio: false, matriculaPagada: false } });
    userId = user.id_usuario;
    await prisma.cuentaAutenticacion.create({ data: { id_usuario: userId, email: user.email, proveedor: 'Local', password_hash: await bcrypt.hash('Test-only-password!', 4) } });

    await t.test('Login, hash del refresh y token valido; JWT antiguo sin sesion rechazado', async () => {
      const s = await login();
      const db = await prisma.sesionAutenticacion.findUniqueOrThrow({ where: { id: s.sid } });
      const raw = s.cookie.split('=')[1]!;
      assert.notEqual(db.refreshHash, raw);
      assert.equal(db.refreshHash, createHash('sha256').update(raw).digest('hex'));
      assert.equal((await me(s.token)).status, 200);
      assert.equal((await me(jwt.sign({ id_usuario: userId, rol: 'Usuario' }, JWT_SECRET, { expiresIn: '1h' }))).status, 401);
    });
    await t.test('Access expirado a 15 min; refresh sin actividad no alarga la sesion', async () => {
      t.mock.timers.setTime(baseTime);
      const s = await login();
      const before = await prisma.sesionAutenticacion.findUniqueOrThrow({ where: { id: s.sid } });
      t.mock.timers.setTime(baseTime + 16 * 60_000);
      assert.equal((await me(s.token)).status, 401);
      const r = await refresh(s.cookie, false); assert.equal(r.status, 200);
      assert.equal((await me(r.body.token)).status, 200);
      const after = await prisma.sesionAutenticacion.findUniqueOrThrow({ where: { id: s.sid } });
      assert.equal(after.lastActivityAt.getTime(), before.lastActivityAt.getTime());
      assert.equal(after.expiresAt.getTime(), before.expiresAt.getTime());
    });
    await t.test('Ejemplo 10:00,10:30,11:00,11:40: a 12:40 expira exactamente', async () => {
      t.mock.timers.setTime(baseTime);
      const s = await login();
      for (const minute of [30, 60, 100]) {
        t.mock.timers.setTime(baseTime + minute * 60_000);
        const r = await refresh(s.cookie); assert.equal(r.status, 200);
        assert.equal((await me(r.body.token)).status, 200);
      }
      t.mock.timers.setTime(baseTime + 160 * 60_000 - 1);
      const r = await refresh(s.cookie, false); assert.equal(r.status, 200);
      assert.equal((await me(r.body.token)).status, 200);
      t.mock.timers.setTime(baseTime + 160 * 60_000);
      assert.equal((await me(r.body.token)).status, 401); // JWT itself still valid.
      assert.equal((await refresh(s.cookie)).status, 401);
      const dashboard = await request('/dashboard/resumen', { headers: { Authorization: `Bearer ${r.body.token}` } });
      assert.equal(dashboard.status, 401);
    });
    await t.test('Logout invalida access y refresh; cookies borradas e idempotencia', async () => {
      t.mock.timers.setTime(baseTime);
      const s = await login();
      for (let i = 0; i < 2; i++) {
        const result = await request('/auth/logout', { method: 'POST', headers: { Cookie: s.cookie, 'X-Aluma-Session': '1' } });
        assert.equal(result.status, 204); assert(result.headers.get('set-cookie')!.includes('1970'));
      }
      assert.equal((await me(s.token)).status, 401); assert.equal((await refresh(s.cookie)).status, 401);
    });
    await t.test('Refresh ausente, alterado, expirado y CSRF', async () => {
      t.mock.timers.setTime(baseTime);
      const s = await login();
      assert.equal((await refresh('')).status, 401);
      assert.equal((await refresh('aluma_refresh=' + '0'.repeat(64))).status, 401);
      assert.equal((await refresh(s.cookie, true, { Origin: 'https://evil.example' })).status, 403);
      assert.equal((await request('/auth/refresh', { method: 'POST', headers: { Cookie: s.cookie } })).status, 403);
      assert.equal((await refresh(s.cookie, true, { Origin: FRONTEND_ORIGIN })).status, 200);
      t.mock.timers.setTime(baseTime + SESSION_IDLE_MS);
      assert.equal((await refresh(s.cookie)).status, 401);
    });
    await t.test('Actividad retrasada no cuenta como interaccion nueva; peticiones simultaneas', async () => {
      t.mock.timers.setTime(baseTime);
      const s = await login();
      t.mock.timers.setTime(baseTime + 30_000);
      assert.equal((await refresh(s.cookie, true, { 'X-Aluma-Activity-Age': '20000' })).status, 200);
      const row = await prisma.sesionAutenticacion.findUniqueOrThrow({ where: { id: s.sid } });
      assert.equal(row.lastActivityAt.getTime(), baseTime + 10_000);
      const results = await Promise.all(Array.from({ length: 5 }, () => refresh(s.cookie, false)));
      assert(results.every(r => r.status === 200));
      assert.equal((await refresh(s.cookie, true, { 'X-Aluma-Activity-Age': '-1' })).status, 401);
    });
    await t.test('Cookie Secure en produccion y usuario bloqueado no renueva', async () => {
      t.mock.timers.setTime(baseTime);
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try { assert((await login()).headers.get('set-cookie')!.includes('Secure')); }
      finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
      const s = await login();
      const blocked = await prisma.estadoUsuario.findFirstOrThrow({ where: { permiteLogin: false } });
      await prisma.usuario.update({ where: { id_usuario: userId }, data: { id_estado_usuario: blocked.id_estado_usuario } });
      assert.equal((await me(s.token)).status, 403);
      assert.equal((await refresh(s.cookie)).status, 401);
    });
  } finally {
    t.mock.timers.reset();
    server.close(); server.closeAllConnections();
    await prisma.auditoria.deleteMany({ where: { requestId: { in: requests } } });
    if (userId) {
      await prisma.cuentaAutenticacion.deleteMany({ where: { id_usuario: userId } });
      await prisma.usuario.delete({ where: { id_usuario: userId } });
    }
    await prisma.$disconnect();
  }
});
