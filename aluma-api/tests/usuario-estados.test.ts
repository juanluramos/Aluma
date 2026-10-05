import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import { prisma } from '../src/config/prisma.js';
import authRoutes from '../src/routes/auth/routes.js';
import userRoutes from '../src/routes/usuario/routes.js';
import { requestId } from '../src/middlewares/request-id.middleware.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';
import { authenticateWithOAuth } from '../src/services/auth/oauth.service.js';

test('Estados y roles actuales con JWT previo; credenciales separadas', async t => {
  const app = express(); app.use(requestId); app.use(express.json());
  app.use('/auth', authRoutes); app.use('/usuarios', userRoutes); app.use(errorMiddleware);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  const marker = `ue-${randomUUID().slice(0, 8)}`;
  const ids: number[] = []; const requests: string[] = [];
  async function request(method: string, path: string, token?: string, body?: unknown) {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    requests.push(response.headers.get('x-request-id')!);
    return { status: response.status, body: await response.json() };
  }
  try {
    const doc = await prisma.tipoDocumentoIdentificacion.findFirstOrThrow();
    const active = await prisma.estadoUsuario.findUniqueOrThrow({ where: { nombre_estado: 'Activo' } });
    const roles = await prisma.rolUsuario.findMany();
    const role = (name: string) => roles.find(r => r.nombre_rol === name)!.id_rol;
    const password = randomUUID(); const hash = await bcrypt.hash(password, 4);
    for (const name of ['Administrador', 'Usuario']) {
      const user = await prisma.usuario.create({ data: {
        email: `${marker}-${name}@aluma.test`, numeroDocumento: `${marker}-${ids.length}`, nombre: marker,
        id_tipo_documento: doc.id_tipo_documento, id_rol: role(name), id_estado_usuario: active.id_estado_usuario,
        socio: false, matriculaPagada: false,
      } });
      ids.push(user.id_usuario);
      await prisma.cuentaAutenticacion.create({ data: { id_usuario: user.id_usuario, proveedor: 'Local', email: user.email, password_hash: hash } });
    }
    const email = `${marker}-Usuario@aluma.test`;
    const adminLogin = await request('POST', '/auth/login', undefined, { email: `${marker}-Administrador@aluma.test`, password });
    assert.equal(adminLogin.status, 200); const adminToken = adminLogin.body.token;
    const login = await request('POST', '/auth/login', undefined, { email, password });
    assert.equal(login.status, 200); const token = login.body.token;
    const id = ids[1]!;
    async function update(data: unknown) {
      const result = await request('PUT', `/usuarios/${id}`, adminToken, data);
      assert.equal(result.status, 200, JSON.stringify(result.body));
    }
    await t.test('Inactivo bloquea login local, OAuth y JWT anterior; Activo recupera acceso', async () => {
      const linked = await authenticateWithOAuth('Google', marker, email); assert.equal(linked.type, 'linked');
      const accounts = await prisma.cuentaAutenticacion.findMany({ where: { id_usuario: id } });
      for (const name of ['Inactivo']) {
        const state = await prisma.estadoUsuario.findUniqueOrThrow({ where: { nombre_estado: name } });
        assert.equal(state.permiteLogin, false);
        await update({ id_estado_usuario: state.id_estado_usuario });
        assert.equal((await request('POST', '/auth/login', undefined, { email, password })).status, 403);
        assert.equal((await request('GET', '/auth/me', token)).status, 403);
        await assert.rejects(authenticateWithOAuth('Google', marker, email), (e: any) => e.code === 'LOGIN_NOT_ALLOWED');
        await assert.rejects(authenticateWithOAuth('Google', `${marker}-new`, email), (e: any) => e.code === 'LOGIN_NOT_ALLOWED');
        assert.deepEqual(await prisma.cuentaAutenticacion.findMany({ where: { id_usuario: id } }), accounts);
        await update({ id_estado_usuario: active.id_estado_usuario });
        assert.equal((await request('GET', '/auth/me', token)).status, 200);
        assert.equal((await request('POST', '/auth/login', undefined, { email, password })).status, 200);
        assert.equal((await authenticateWithOAuth('Google', marker, email)).type, 'login');
      }
    });
    await t.test('cambios de rol afectan al mismo JWT y no modifican credenciales', async () => {
      const accounts = await prisma.cuentaAutenticacion.findMany({ where: { id_usuario: id } });
      assert.equal((await request('GET', '/usuarios', token)).status, 403);
      await update({ id_rol: role('Administrador') });
      assert.equal((await request('GET', '/auth/me', token)).body.rol, 'Administrador');
      assert.equal((await request('GET', '/usuarios', token)).status, 200);
      const privileged = await request('POST', '/auth/login', undefined, { email, password });
      await update({ id_rol: role('Usuario'), email: `${marker}-updated@aluma.test` });
      assert.equal((await request('GET', '/usuarios', privileged.body.token)).status, 403);
      assert.equal((await request('GET', '/auth/me', privileged.body.token)).body.rol, 'Usuario');
      assert.deepEqual(await prisma.cuentaAutenticacion.findMany({ where: { id_usuario: id } }), accounts);
      assert.equal((await request('POST', '/auth/login', undefined, { email, password })).status, 200);
      assert.equal((await authenticateWithOAuth('Google', marker, email)).type, 'login');
      for (const data of [{ id_estado_usuario: 2147483647 }, { id_rol: 2147483647 }]) {
        assert.equal((await request('PUT', `/usuarios/${id}`, adminToken, data)).status, 409);
      }
      await prisma.cuentaAutenticacion.deleteMany({ where: { id_usuario: id } });
      await prisma.usuario.delete({ where: { id_usuario: id } });
      assert.equal((await request('GET', '/auth/me', token)).status, 401);
    });
  } finally {
    const closed = once(server, 'close'); server.close(); server.closeAllConnections(); await closed;
    try {
      await prisma.auditoria.deleteMany({ where: { requestId: { in: requests } } });
      await prisma.cuentaAutenticacion.deleteMany({ where: { id_usuario: { in: ids } } });
      await prisma.usuario.deleteMany({ where: { id_usuario: { in: ids } } });
    } finally { await prisma.$disconnect(); }
  }
});
