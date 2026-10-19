import { initSocket } from '../src/socket/socket.js';
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

test('Eliminacion HTTP de usuarios y auditoria atomica', async (t) => {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/usuarios', userRoutes);
  app.use(errorMiddleware);
  const server = app.listen(0, '127.0.0.1');
  initSocket(server);
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api`;
  const marker = `ud-${randomUUID().slice(0, 8)}`;
  const ids: number[] = [];
  const activityIds: number[] = [];
  const enrollmentIds: number[] = [];
  const requestIds: string[] = [];

  async function request(method: string, path: string, token?: string, body?: unknown) {
    const response = await fetch(base + path, {
      method, headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      }, ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const id = response.headers.get('x-request-id');
    assert(id);
    requestIds.push(id);
    return { status: response.status, body: response.status === 204 ? null : await response.json(), requestId: id };
  }

  try {
    const state = await prisma.estadoUsuario.findFirstOrThrow({ where: { permiteLogin: true } });
    const document = await prisma.tipoDocumentoIdentificacion.findFirstOrThrow();
    const activityState = await prisma.estadoActividad.findFirstOrThrow();
    const paymentState = await prisma.estadoPago.findUniqueOrThrow({ where: { nombre_estado: 'Pendiente' } });
    const enrollmentState = await prisma.estadoInscripcion.findUniqueOrThrow({ where: { nombre: 'Activa' } });

    async function fixture(role: string) {
      const dbRole = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: role } });
      const user = await prisma.usuario.create({ data: {
        email: `${marker}-${ids.length}@aluma.test`, numeroDocumento: `${marker}-${ids.length}`,
        nombre: marker, id_tipo_documento: document.id_tipo_documento,
        id_rol: dbRole.id_rol, id_estado_usuario: state.id_estado_usuario,
        socio: false, matriculaPagada: false,
      } });
      ids.push(user.id_usuario);
      return user;
    }

    async function loginAs(role: string) {
      const user = await fixture(role);
      const password = randomUUID();
      await prisma.cuentaAutenticacion.create({ data: {
        id_usuario: user.id_usuario, proveedor: 'Local', email: user.email,
        password_hash: await bcrypt.hash(password, 4),
      } });
      const login = await request('POST', '/auth/login', undefined, { email: user.email, password });
      assert.equal(login.status, 200);
      return { user, token: login.body.token as string };
    }

    const admin = await loginAs('Administrador');
    const operador = await loginAs('Operador');

    await t.test('Administrador elimina su propia cuenta → 403 SELF_DELETION_FORBIDDEN', async () => {
      const result = await request('DELETE', `/usuarios/${admin.user.id_usuario}`, admin.token);
      assert.equal(result.status, 403);
      assert.equal(result.body.code, 'SELF_DELETION_FORBIDDEN');
      assert.deepEqual(
        await prisma.usuario.findUnique({ where: { id_usuario: admin.user.id_usuario } }),
        admin.user,
      );
      assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
    });

    await t.test('Operador intenta eliminar un usuario → 403', async () => {
      const target = await fixture('Usuario');
      const result = await request('DELETE', `/usuarios/${target.id_usuario}`, operador.token);
      assert.equal(result.status, 403);
      assert.equal(result.body.code, 'FORBIDDEN');
      assert.deepEqual(await prisma.usuario.findUnique({ where: { id_usuario: target.id_usuario } }), target);
      assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
    });

    await t.test('Usuario con inscripciones → 409 FOREIGN_KEY_CONSTRAINT', async () => {
      const target = await fixture('Usuario');
      const activity = await prisma.actividad.create({ data: {
        titulo: `${marker}-act`,
        id_estado_actividad: activityState.id_estado_actividad,
      } });
      activityIds.push(activity.id_actividad);
      const enrollment = await prisma.inscripcionActividad.create({ data: {
        id_usuario: target.id_usuario,
        id_actividad: activity.id_actividad,
        id_estado_pago: paymentState.id_estado_pago,
        id_estado_inscripcion: enrollmentState.id_estado_inscripcion,
        apuntadoFecha: new Date('2026-10-01T00:00:00.000Z'),
      } });
      enrollmentIds.push(enrollment.id_inscripcion);

      const result = await request('DELETE', `/usuarios/${target.id_usuario}`, admin.token);
      assert.equal(result.status, 409);
      assert.equal(result.body.code, 'FOREIGN_KEY_CONSTRAINT');
      assert.deepEqual(await prisma.usuario.findUnique({ where: { id_usuario: target.id_usuario } }), target);
      assert.deepEqual(
        await prisma.inscripcionActividad.findUnique({ where: { id_inscripcion: enrollment.id_inscripcion } }),
        enrollment,
      );
      assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
    });

    await t.test('DELETE 204 conserva una unica auditoria historica; segundo DELETE no duplica', async () => {
      const target = await fixture('Usuario');
      const path = `/usuarios/${target.id_usuario}`;
      const result = await request('DELETE', path, admin.token);
      assert.equal(result.status, 204);
      assert.equal(await prisma.usuario.findUnique({ where: { id_usuario: target.id_usuario } }), null);
      const audits = await prisma.auditoria.findMany({ where: { requestId: result.requestId } });
      assert.equal(audits.length, 1);
      const audit = audits[0]!;
      assert.equal(audit.requestId, result.requestId);
      assert.equal(audit.id_usuario, admin.user.id_usuario);
      assert.equal(audit.rol_actor, 'Administrador');
      assert.equal(audit.accion, 'USUARIO_ELIMINADO');
      assert.equal(audit.recurso, 'USUARIO');
      assert.equal(audit.id_recurso, target.id_usuario);
      assert.equal(audit.resultado, 'REALIZADA');
      assert.equal(audit.codigo_error, null);
      assert.equal(audit.detalles, null);
      const second = await request('DELETE', path, admin.token);
      assert.equal(second.status, 404);
      assert.equal(second.body.code, 'USER_NOT_FOUND');
      assert.equal(await prisma.auditoria.count({ where: { requestId: second.requestId } }), 0);
      assert.equal(await prisma.auditoria.count({ where: {
        accion: 'USUARIO_ELIMINADO', recurso: 'USUARIO', id_recurso: target.id_usuario,
      } }), 1);
    });

    await t.test('Usuario inexistente → 404 USER_NOT_FOUND', async () => {
      const missingId = 2_147_483_646;
      assert.equal(await prisma.usuario.findUnique({ where: { id_usuario: missingId } }), null);
      const result = await request('DELETE', `/usuarios/${missingId}`, admin.token);
      assert.equal(result.status, 404);
      assert.equal(result.body.code, 'USER_NOT_FOUND');
      assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
    });

    for (const afterInsert of [false, true]) {
      await t.test(`Rollback si falla auditoria ${afterInsert ? 'despues' : 'antes'} de insertar`, async (subtest) => {
        const target = await fixture('Usuario');
        const failure = new Error('Fallo controlado de auditoria de eliminacion');
        const transactionMethod = prisma.$transaction;
        const originalTransaction = transactionMethod.bind(prisma);
        let calls = 0;
        let inserted = false;
        // Stub local sobre una transaccion real; se restaura siempre.
        prisma.$transaction = (async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          originalTransaction(async (tx) => {
            const delegate = tx.auditoria;
            const createMethod = delegate.create;
            delegate.create = (async (args: Prisma.AuditoriaCreateArgs) => {
              calls++;
              assert.equal(await tx.usuario.findUnique({ where: { id_usuario: target.id_usuario } }), null);
              assert.deepEqual(await prisma.usuario.findUnique({ where: { id_usuario: target.id_usuario } }), target);
              assert.equal(args.data.id_recurso, target.id_usuario);
              if (afterInsert) {
                await createMethod.call(delegate, args);
                inserted = true;
              }
              throw failure;
            }) as typeof delegate.create;
            try { return await operation(tx); }
            finally { delegate.create = createMethod; }
          })) as typeof prisma.$transaction;
        const logMock = subtest.mock.method(console, 'error', () => {});
        try {
          const result = await request('DELETE', `/usuarios/${target.id_usuario}`, admin.token);
          assert.equal(result.status, 500);
          assert.equal(calls, 1);
          assert.equal(inserted, afterInsert);
          assert(logMock.mock.calls.some(call => String(call.arguments[0]).includes('INTERNAL_SERVER_ERROR')));
          assert(!logMock.mock.calls.some(call => call.arguments.includes(failure)));
          assert.deepEqual(await prisma.usuario.findUnique({ where: { id_usuario: target.id_usuario } }), target);
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
      // Solo registros temporales identificados por esta ejecucion.
      await prisma.$transaction(async (tx) => {
        await tx.auditoria.deleteMany({ where: { requestId: { in: requestIds } } });
        await tx.inscripcionActividad.deleteMany({ where: { id_inscripcion: { in: enrollmentIds } } });
        await tx.actividad.deleteMany({ where: { id_actividad: { in: activityIds } } });
        await tx.cuentaAutenticacion.deleteMany({ where: { id_usuario: { in: ids } } });
        await tx.usuario.deleteMany({ where: { id_usuario: { in: ids } } });
      });
    } finally { await prisma.$disconnect(); }
  }
});
