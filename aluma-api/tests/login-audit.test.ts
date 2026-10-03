import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/config/prisma.js';
import authRoutes from '../src/routes/auth/routes.js';
import { requestId } from '../src/middlewares/request-id.middleware.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';

test('Auditoria independiente de login', async (t) => {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use(errorMiddleware);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/auth/login`;
  const marker = `la-${randomUUID().slice(0, 8)}`;
  const userIds: number[] = [];
  const requestIds: string[] = [];
  const password = randomUUID();
  const wrongPassword = randomUUID();
  const hash = await bcrypt.hash(password, 4);
  const tokens: string[] = [];
  async function login(email: string, suppliedPassword = password) {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: suppliedPassword }),
    });
    const id = response.headers.get('x-request-id');
    assert(id);
    requestIds.push(id);
    const body = await response.json();
    if (body.token) tokens.push(body.token);
    return { status: response.status, body, requestId: id };
  }
  function noSecrets(value: unknown) {
    const text = JSON.stringify(value, (_, v) => typeof v === 'bigint' ? String(v) : v);
    for (const secret of [password, wrongPassword, hash, ...tokens, 'password_hash', 'password', 'token']) {
      assert.equal(text.includes(secret), false);
    }
  }
  try {
    const allowedState = await prisma.estadoUsuario.findFirstOrThrow({ where: { permiteLogin: true } });
    const blockedState = await prisma.estadoUsuario.findFirstOrThrow({ where: { permiteLogin: false } });
    const document = await prisma.tipoDocumentoIdentificacion.findFirstOrThrow();
    const role = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: 'Usuario' } });
    async function fixture(blocked = false, missingHash = false) {
      const user = await prisma.usuario.create({ data: {
        email: `${marker}-${userIds.length}@aluma.test`, numeroDocumento: `${marker}-${userIds.length}`,
        nombre: marker, id_tipo_documento: document.id_tipo_documento, id_rol: role.id_rol,
        id_estado_usuario: blocked ? blockedState.id_estado_usuario : allowedState.id_estado_usuario,
        socio: false, matriculaPagada: false,
      } });
      userIds.push(user.id_usuario);
      await prisma.cuentaAutenticacion.create({ data: {
        id_usuario: user.id_usuario, proveedor: 'Local', email: user.email,
        password_hash: missingHash ? null : hash,
      } });
      return user;
    }
    const allowed = await fixture();
    const blocked = await fixture(true);
    const noHash = await fixture(false, true);
    const cases = [
      { name: 'Login correcto', email: allowed.email, password, status: 200, code: null, actor: allowed.id_usuario },
      { name: 'Password incorrecto', email: allowed.email, password: wrongPassword, status: 401, code: 'INVALID_CREDENTIALS', actor: null },
      { name: 'Cuenta inexistente', email: `${marker}-absent@aluma.test`, password, status: 401, code: 'INVALID_CREDENTIALS', actor: null },
      { name: 'Cuenta sin hash', email: noHash.email, password, status: 401, code: 'INVALID_CREDENTIALS', actor: null },
      { name: 'Login no permitido', email: blocked.email, password, status: 403, code: 'LOGIN_NOT_ALLOWED', actor: blocked.id_usuario },
      { name: 'Bloqueado con password incorrecto sigue anonimo', email: blocked.email, password: wrongPassword, status: 401, code: 'INVALID_CREDENTIALS', actor: null },
    ];
    for (const item of cases) {
      await t.test(item.name, async () => {
        const result = await login(item.email, item.password);
        assert.equal(result.status, item.status);
        if (item.status === 200) {
          assert.equal(typeof result.body.token, 'string');
          assert.equal(result.body.token.split('.').length, 3);
          assert.deepEqual(Object.keys(result.body), ['token']);
        } else assert.equal(result.body.code, item.code);
        const rows = await prisma.auditoria.findMany({ where: { requestId: result.requestId } });
        assert.equal(rows.length, 1);
        const audit = rows[0]!;
        assert.equal(audit.accion, item.status === 200 ? 'LOGIN_REALIZADO' : 'LOGIN_RECHAZADO');
        assert.equal(audit.recurso, 'USUARIO');
        assert.equal(audit.requestId, result.requestId);
        assert.equal(audit.id_usuario, item.actor);
        assert.equal(audit.id_recurso, item.actor);
        assert.equal(audit.rol_actor, item.actor === null ? null : role.nombre_rol);
        assert.equal(audit.resultado, item.status === 200 ? 'REALIZADA' : 'RECHAZADA');
        assert.equal(audit.codigo_error, item.code);
        assert.equal(audit.detalles, null);
        noSecrets(audit);
        assert.equal(JSON.stringify(audit, (_, v) => typeof v === 'bigint' ? String(v) : v).includes(item.email), false);
      });
    }
    for (const item of [cases[0]!, cases[1]!, cases[4]!]) {
      await t.test(`Fallo de persistencia conserva ${item.status} y registra requestId sin secretos`, async (subtest) => {
        // Fallo en la persistencia real llamada por AuditoriaRepository, sin modificarlo.
        const delegate = prisma.auditoria;
        const originalCreate = delegate.create;
        const originalTransaction = prisma.$transaction;
        const createMock = subtest.mock.fn(async (..._args: unknown[]) => {
          throw new Error(`Fallo simulado con datos privados ${password} ${hash}`);
        });
        const logMock = subtest.mock.method(console, 'error', () => {});
        const transactionMock = subtest.mock.fn(() => {
          throw new Error('El login no debe abrir transacciones');
        });
        delegate.create = createMock as typeof delegate.create;
        prisma.$transaction = transactionMock as typeof prisma.$transaction;
        try {
          const result = await login(item.email, item.password);
          assert.equal(result.status, item.status);
          if (item.status === 200) {
            assert.equal(typeof result.body.token, 'string');
            assert.equal(result.body.token.split('.').length, 3);
          } else assert.equal(result.body.code, item.code);
          assert.equal(createMock.mock.calls.length, 1);
          assert.equal(transactionMock.mock.calls.length, 0);
          assert.equal(logMock.mock.calls.length, 1);
          const log = logMock.mock.calls[0]!.arguments;
          assert(JSON.stringify(log).includes(result.requestId));
          assert(JSON.stringify(log).includes('AUDIT_WRITE_FAILED'));
          noSecrets(log);
          noSecrets(createMock.mock.calls[0]!.arguments);
          assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
        } finally {
          delegate.create = originalCreate;
          logMock.mock.restore();
          prisma.$transaction = originalTransaction;
        }
      });
    }
  } finally {
    const closed = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await closed;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.auditoria.deleteMany({ where: { requestId: { in: requestIds } } });
        await tx.cuentaAutenticacion.deleteMany({ where: { id_usuario: { in: userIds } } });
        await tx.usuario.deleteMany({ where: { id_usuario: { in: userIds } } });
      });
    } finally { await prisma.$disconnect(); }
  }
});
