import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/config/prisma.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import userRoutes from '../src/routes/usuario/routes.js';
import authRoutes from '../src/routes/auth/routes.js';
import { requestId } from '../src/middlewares/request-id.middleware.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';

test('Modificacion HTTP de usuarios y auditoria atomica', async (t) => {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/usuarios', userRoutes);
  app.use(errorMiddleware);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api`;
  const marker = `um-${randomUUID().slice(0, 8)}`;
  const ids: number[] = [];
  const requestIds: string[] = [];

  async function request(method: string, path: string, body: unknown, token?: string) {
    const response = await fetch(base + path, {
      method, headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      }, body: JSON.stringify(body),
    });
    const id = response.headers.get('x-request-id');
    assert(id);
    requestIds.push(id);
    return { status: response.status, body: await response.json(), requestId: id };
  }

  try {
    const state = await prisma.estadoUsuario.findFirstOrThrow({ where: { permiteLogin: true } });
    const document = await prisma.tipoDocumentoIdentificacion.findFirstOrThrow();
    const password = randomUUID();
    const hash = await bcrypt.hash(password, 4);
    const actors: { id: number; role: string; token: string }[] = [];
    for (const role of ['Usuario', 'Operador', 'Administrador']) {
      const dbRole = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: role } });
      const actor = await prisma.usuario.create({ data: {
        email: `${marker}-${ids.length}@aluma.test`, numeroDocumento: `${marker}-${ids.length}`,
        nombre: marker, id_tipo_documento: document.id_tipo_documento,
        id_rol: dbRole.id_rol, id_estado_usuario: state.id_estado_usuario,
        socio: false, matriculaPagada: false,
      } });
      ids.push(actor.id_usuario);
      await prisma.cuentaAutenticacion.create({ data: {
        id_usuario: actor.id_usuario, proveedor: 'Local', email: actor.email, password_hash: hash,
      } });
      const login = await request('POST', '/auth/login', { email: actor.email, password });
      assert.equal(login.status, 200);
      actors.push({ id: actor.id_usuario, role, token: login.body.token });
    }
    const target = actors[0]!;
    const path = `/usuarios/${target.id}`;

    for (const actor of actors) {
      await t.test(`${actor.role}: actualizacion con una sola auditoria y cambios exactos`, async () => {
        const before = await prisma.usuario.findUniqueOrThrow({ where: { id_usuario: target.id } });
        const nombre = `${marker}-${actor.role}`;
        const telefono = `60000000${actors.indexOf(actor)}`;
        const result = await request('PUT', path, { nombre, telefono, email: before.email }, actor.token);
        assert.equal(result.status, 200, JSON.stringify(result.body));
        const after = await prisma.usuario.findUniqueOrThrow({ where: { id_usuario: target.id } });
        assert.equal(after.nombre, nombre);
        assert.equal(after.telefono, telefono);
        const audits = await prisma.auditoria.findMany({ where: { requestId: result.requestId } });
        assert.equal(audits.length, 1);
        const audit = audits[0]!;
        assert.equal(audit.requestId, result.requestId);
        assert.equal(audit.id_usuario, actor.id);
        assert.equal(audit.rol_actor, actor.role);
        assert.equal(audit.accion, 'USUARIO_MODIFICADO');
        assert.equal(audit.recurso, 'USUARIO');
        assert.equal(audit.id_recurso, target.id);
        assert.equal(audit.resultado, 'REALIZADA');
        assert.equal(audit.codigo_error, null);
        assert.deepEqual(audit.detalles, { cambios: {
          nombre: { anterior: before.nombre, nuevo: nombre },
          telefono: { anterior: before.telefono, nuevo: telefono },
        } });
      });
    }

    await t.test('Sin cambios reales no se crea auditoria', async () => {
      const before = await prisma.usuario.findUniqueOrThrow({ where: { id_usuario: target.id } });
      const result = await request('PUT', path, { nombre: before.nombre, email: before.email }, target.token);
      assert.equal(result.status, 200);
      assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
      assert.deepEqual(await prisma.usuario.findUnique({ where: { id_usuario: target.id } }), before);
    });

    for (const afterInsert of [false, true]) {
      await t.test(`Rollback ${afterInsert ? 'despues' : 'antes'} de insertar auditoria`, async (subtest) => {
        const before = await prisma.usuario.findUniqueOrThrow({ where: { id_usuario: target.id } });
        const nombre = `${marker}-rollback`;
        const failure = new Error('Fallo controlado de auditoria de modificacion');
        const transactionMethod = prisma.$transaction;
        const originalTransaction = transactionMethod.bind(prisma);
        let calls = 0;
        let inserted = false;
        // Se usa una transaccion real y se restaura el stub incluso si falla la prueba.
        prisma.$transaction = (async (
          operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
        ) =>
          originalTransaction(async (tx) => {
            const delegate = tx.auditoria;
            const createMethod = delegate.create;
            delegate.create = (async (args: Prisma.AuditoriaCreateArgs) => {
              calls++;
              const inTransaction = await tx.usuario.findUniqueOrThrow({ where: { id_usuario: target.id } });
              assert.equal(inTransaction.nombre, nombre);
              assert.deepEqual(await prisma.usuario.findUnique({ where: { id_usuario: target.id } }), before);
              if (!afterInsert) throw failure;
              const audit = await createMethod.call(delegate, args);
              inserted = true;
              return audit;
            }) as typeof delegate.create;
            try {
              const result = await operation(tx);
              // Fallo posterior al servicio, aun dentro de la transaccion sin confirmar.
              if (afterInsert) throw failure;
              return result;
            } finally { delegate.create = createMethod; }
          }, options)) as typeof prisma.$transaction;
        const logMock = subtest.mock.method(console, 'error', () => {});
        try {
          const result = await request('PUT', path, { nombre }, actors[1]!.token);
          assert.equal(result.status, 500);
          assert.equal(calls, 1);
          assert.equal(inserted, afterInsert);
          assert(logMock.mock.calls.some(call => String(call.arguments[0]).includes('INTERNAL_SERVER_ERROR')));
          assert(!logMock.mock.calls.some(call => call.arguments.includes(failure)));
          assert.deepEqual(await prisma.usuario.findUnique({ where: { id_usuario: target.id } }), before);
          assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
        } finally {
          prisma.$transaction = transactionMethod;
          logMock.mock.restore();
        }
      });
    }
  } finally {
    const closed = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await closed;
    try {
      // Limpieza exclusiva de los UUIDs y usuarios creados por esta prueba.
      await prisma.$transaction(async (tx) => {
        await tx.auditoria.deleteMany({ where: { requestId: { in: requestIds } } });
        await tx.cuentaAutenticacion.deleteMany({ where: { id_usuario: { in: ids } } });
        await tx.usuario.deleteMany({ where: { id_usuario: { in: ids } } });
      });
    } finally { await prisma.$disconnect(); }
  }
});
