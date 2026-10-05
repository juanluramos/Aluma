import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/config/prisma.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import activityRoutes from '../src/routes/actividad/routes.js';
import authRoutes from '../src/routes/auth/routes.js';
import { requestId } from '../src/middlewares/request-id.middleware.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';

test('Eliminacion HTTP de actividades y auditoria atomica', async (t) => {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/actividades', activityRoutes);
  app.use(errorMiddleware);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api`;
  const marker = `ad-${randomUUID().slice(0, 8)}`;
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
    async function fixture() {
      const activity = await prisma.actividad.create({ data: {
        titulo: `${marker}-${activityIds.length}`, id_estado_actividad: activityState.id_estado_actividad,
      } });
      activityIds.push(activity.id_actividad);
      return activity;
    }
    const password = randomUUID();
    const hash = await bcrypt.hash(password, 4);
    const actors: { id: number; role: string; token: string }[] = [];
    for (const role of ['Administrador', 'Operador', 'Usuario']) {
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
      const login = await request('POST', '/auth/login', undefined, { email: actor.email, password });
      assert.equal(login.status, 200);
      actors.push({ id: actor.id_usuario, role, token: login.body.token });
    }
    const admin = actors[0]!;
    await t.test('DELETE 204 conserva contexto e ID historico; segundo DELETE no duplica', async () => {
      const target = await fixture();
      const path = `/actividades/${target.id_actividad}`;
      const result = await request('DELETE', path, admin.token);
      assert.equal(result.status, 204);
      assert.equal(await prisma.actividad.findUnique({ where: { id_actividad: target.id_actividad } }), null);
      const audits = await prisma.auditoria.findMany({ where: { requestId: result.requestId } });
      assert.equal(audits.length, 1);
      const audit = audits[0]!;
      assert.equal(audit.requestId, result.requestId);
      assert.equal(audit.id_usuario, admin.id);
      assert.equal(audit.rol_actor, admin.role);
      assert.equal(audit.accion, 'ACTIVIDAD_ELIMINADA');
      assert.equal(audit.recurso, 'ACTIVIDAD');
      assert.equal(audit.id_recurso, target.id_actividad);
      assert.equal(audit.resultado, 'REALIZADA');
      assert.equal(audit.codigo_error, null);
      assert.equal(audit.detalles, null);
      const second = await request('DELETE', path, admin.token);
      assert.equal(second.status, 404);
      assert.equal(second.body.code, 'ACTIVITY_NOT_FOUND');
      assert.equal(await prisma.auditoria.count({ where: { requestId: second.requestId } }), 0);
      assert.equal(await prisma.auditoria.count({ where: {
        accion: 'ACTIVIDAD_ELIMINADA', recurso: 'ACTIVIDAD', id_recurso: target.id_actividad,
      } }), 1);
    });
    await t.test('JWT y permisos existentes impiden borrar sin generar auditoria', async () => {
      const target = await fixture();
      for (const token of [undefined, actors[1]!.token, actors[2]!.token]) {
        const result = await request('DELETE', `/actividades/${target.id_actividad}`, token);
        assert.equal(result.status, token ? 403 : 401);
        assert.deepEqual(await prisma.actividad.findUnique({ where: { id_actividad: target.id_actividad } }), target);
        assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
      }
    });
    await t.test('Inscripcion asociada mantiene restriccion FK sin auditoria de exito', async () => {
      const target = await fixture();
      const paymentState = await prisma.estadoPago.findUniqueOrThrow({ where: { nombre_estado: 'Pendiente' } });
      const enrollmentState = await prisma.estadoInscripcion.findUniqueOrThrow({ where: { nombre: 'Activa' } });
      const enrollment = await prisma.inscripcionActividad.create({ data: {
        id_usuario: admin.id, id_actividad: target.id_actividad,
        id_estado_pago: paymentState.id_estado_pago,
        id_estado_inscripcion: enrollmentState.id_estado_inscripcion,
        apuntadoFecha: new Date('2026-10-01T00:00:00.000Z'),
      } });
      enrollmentIds.push(enrollment.id_inscripcion);
      const result = await request('DELETE', `/actividades/${target.id_actividad}`, admin.token);
      assert.equal(result.status, 409);
      assert.equal(result.body.code, 'FOREIGN_KEY_CONSTRAINT');
      assert.deepEqual(await prisma.actividad.findUnique({ where: { id_actividad: target.id_actividad } }), target);
      assert.deepEqual(await prisma.inscripcionActividad.findUnique({ where: { id_inscripcion: enrollment.id_inscripcion } }), enrollment);
      assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
    });
    for (const afterInsert of [false, true]) {
      await t.test(`Rollback ${afterInsert ? 'despues' : 'antes'} de insertar auditoria`, async (subtest) => {
        const target = await fixture();
        const where = { id_actividad: target.id_actividad };
        const failure = new Error('Fallo controlado de auditoria de eliminacion de actividad');
        const transactionMethod = prisma.$transaction;
        const originalTransaction = transactionMethod.bind(prisma);
        let calls = 0;
        let inserted = false;
        // Stub temporal con transaccion real, restaurado siempre.
        prisma.$transaction = (async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          originalTransaction(async (tx) => {
            const delegate = tx.auditoria;
            const createMethod = delegate.create;
            delegate.create = (async (args: Prisma.AuditoriaCreateArgs) => {
              calls++;
              assert.equal(await tx.actividad.findUnique({ where }), null);
              assert.deepEqual(await prisma.actividad.findUnique({ where }), target);
              assert.equal(args.data.id_recurso, target.id_actividad);
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
          const result = await request('DELETE', `/actividades/${target.id_actividad}`, admin.token);
          assert.equal(result.status, 500);
          assert.equal(calls, 1);
          assert.equal(inserted, afterInsert);
          assert(logMock.mock.calls.some(call => String(call.arguments[0]).includes('INTERNAL_SERVER_ERROR')));
          assert(!logMock.mock.calls.some(call => call.arguments.includes(failure)));
          assert.deepEqual(await prisma.actividad.findUnique({ where }), target);
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
      // Solo fixtures de esta ejecucion, nunca registros de negocio existentes.
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
