import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/config/prisma.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import movementRoutes from '../src/routes/movimiento-contable/routes.js';
import authRoutes from '../src/routes/auth/routes.js';
import { requestId } from '../src/middlewares/request-id.middleware.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';

test('Eliminacion HTTP de movimientos independientes y auditoria atomica', async (t) => {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/movimientos', movementRoutes);
  app.use(errorMiddleware);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api`;
  const marker = `md-${randomUUID().slice(0, 8)}`;
  const ids: number[] = [];
  const movementIds: number[] = [];
  const activityIds: number[] = [];
  const enrollmentIds: number[] = [];
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
    return { status: response.status, body: response.status === 204 ? null : await response.json(), requestId: id };
  }
  try {
    const state = await prisma.estadoUsuario.findFirstOrThrow({ where: { permiteLogin: true } });
    const document = await prisma.tipoDocumentoIdentificacion.findFirstOrThrow();
    const chargeType = await prisma.tipoMovimiento.findUniqueOrThrow({ where: { nombre: 'Cobro' } });
    async function fixture(id_inscripcion: number | null = null) {
      const movement = await prisma.movimientoContable.create({ data: {
        concepto: `${marker}-${movementIds.length}`, id_tipo_movimiento: chargeType.id_tipo_movimiento,
        importe: 10, fecha: new Date('2026-10-03'), comentario: 'Texto privado anterior', id_inscripcion,
      } });
      movementIds.push(movement.id_movimiento);
      return movement;
    }
    const password = randomUUID();
    const hash = await bcrypt.hash(password, 4);
    const actors: { id: number; role: string; token: string }[] = [];
    for (const role of ['Operador', 'Administrador', 'Usuario']) {
      const dbRole = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: role } });
      const actor = await prisma.usuario.create({ data: {
        email: `${marker}-${ids.length}@aluma.test`, numeroDocumento: `${marker.slice(0, 12)}-${ids.length}`,
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
    const admin = actors[1]!;
    await t.test('DELETE 204: contexto, ID historico persistente y segundo DELETE 404 sin duplicacion', async () => {
      const before = await fixture();
      const where = { id_movimiento: before.id_movimiento };
      const path = `/movimientos/${before.id_movimiento}`;
      const result = await request('DELETE', path, undefined, admin.token);
      assert.equal(result.status, 204);
      assert.equal(await prisma.movimientoContable.findUnique({ where }), null);
      const audits = await prisma.auditoria.findMany({ where: { requestId: result.requestId } });
      assert.equal(audits.length, 1);
      const audit = audits[0]!;
      assert.equal(audit.requestId, result.requestId);
      assert.equal(audit.id_usuario, admin.id);
      assert.equal(audit.rol_actor, admin.role);
      assert.equal(audit.accion, 'MOVIMIENTO_ELIMINADO');
      assert.equal(audit.recurso, 'MOVIMIENTO_CONTABLE');
      assert.equal(audit.id_recurso, before.id_movimiento);
      assert.equal(audit.resultado, 'REALIZADA');
      assert.equal(audit.codigo_error, null);
      assert.equal(audit.detalles, null);
      const second = await request('DELETE', path, undefined, admin.token);
      assert.equal(second.status, 404);
      assert.equal(second.body.code, 'ACCOUNTING_MOVEMENT_NOT_FOUND');
      assert.equal(await prisma.auditoria.count({ where: { requestId: second.requestId } }), 0);
      assert.deepEqual(await prisma.auditoria.findMany({ where: {
        accion: 'MOVIMIENTO_ELIMINADO', recurso: 'MOVIMIENTO_CONTABLE', id_recurso: before.id_movimiento,
      } }), audits);
    });
    for (const afterInsert of [false, true]) {
      await t.test(`Rollback ${afterInsert ? 'despues' : 'antes'} de insertar auditoria`, async (subtest) => {
        const before = await fixture();
        const where = { id_movimiento: before.id_movimiento };
        const failure = new Error('Fallo controlado de auditoria de eliminacion');
        const transactionMethod = prisma.$transaction;
        const originalTransaction = transactionMethod.bind(prisma);
        let calls = 0;
        let inserted = false;
        prisma.$transaction = (async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          originalTransaction(async (tx) => {
            const delegate = tx.auditoria;
            const createMethod = delegate.create;
            delegate.create = (async (args: Prisma.AuditoriaCreateArgs) => {
              calls++;
              assert.equal(await tx.movimientoContable.findUnique({ where }), null);
              assert.deepEqual(await prisma.movimientoContable.findUnique({ where }), before);
              assert.equal(args.data.accion, 'MOVIMIENTO_ELIMINADO');
              assert.equal(args.data.id_recurso, before.id_movimiento);
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
          const result = await request('DELETE', `/movimientos/${before.id_movimiento}`, undefined, admin.token);
          assert.equal(result.status, 500);
          assert.equal(calls, 1);
          assert.equal(inserted, afterInsert);
          assert(logMock.mock.calls.some(call => call.arguments.includes(failure)));
          assert.deepEqual(await prisma.movimientoContable.findUnique({ where }), before);
          assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
        } finally {
          prisma.$transaction = transactionMethod;
          logMock.mock.restore();
        }
      });
    }
    await t.test('Permisos existentes: sin JWT o JWT invalido 401, Operador y Usuario 403', async () => {
      const before = await fixture();
      for (const [token, status] of [
        [undefined, 401], ['invalid-token', 401], [actors[0]!.token, 403], [actors[2]!.token, 403],
      ] as const) {
        const result = await request('DELETE', `/movimientos/${before.id_movimiento}`, undefined, token);
        assert.equal(result.status, status);
        assert.deepEqual(await prisma.movimientoContable.findUnique({ where: { id_movimiento: before.id_movimiento } }), before);
        assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
      }
    });
    await t.test('Movimiento vinculado: DELETE protegido; sin auditoria', async () => {
      const activityState = await prisma.estadoActividad.findFirstOrThrow();
      const activity = await prisma.actividad.create({ data: { titulo: marker, id_estado_actividad: activityState.id_estado_actividad } });
      activityIds.push(activity.id_actividad);
      const paymentState = await prisma.estadoPago.findUniqueOrThrow({ where: { nombre_estado: 'Pagado' } });
      const enrollmentState = await prisma.estadoInscripcion.findUniqueOrThrow({ where: { nombre: 'Activa' } });
      const enrollment = await prisma.inscripcionActividad.create({ data: {
        id_usuario: actors[0]!.id, id_actividad: activity.id_actividad,
        id_estado_pago: paymentState.id_estado_pago, id_estado_inscripcion: enrollmentState.id_estado_inscripcion,
        apuntadoFecha: new Date('2026-10-03'),
      } });
      enrollmentIds.push(enrollment.id_inscripcion);
      const before = await fixture(enrollment.id_inscripcion);
      const result = await request('DELETE', `/movimientos/${before.id_movimiento}`, undefined, admin.token);
      assert.equal(result.status, 409);
      assert.equal(result.body.code, 'ENROLLMENT_MOVEMENT_PROTECTED');
      assert.deepEqual(await prisma.movimientoContable.findUnique({ where: { id_movimiento: before.id_movimiento } }), before);
      assert.deepEqual(await prisma.inscripcionActividad.findUnique({ where: { id_inscripcion: enrollment.id_inscripcion } }), enrollment);
      assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
    });
  } finally {
    const closed = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await closed;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.auditoria.deleteMany({ where: { requestId: { in: requestIds } } });
        await tx.movimientoContable.deleteMany({ where: { id_movimiento: { in: movementIds } } });
        await tx.inscripcionActividad.deleteMany({ where: { id_inscripcion: { in: enrollmentIds } } });
        await tx.actividad.deleteMany({ where: { id_actividad: { in: activityIds } } });
        await tx.cuentaAutenticacion.deleteMany({ where: { id_usuario: { in: ids } } });
        await tx.usuario.deleteMany({ where: { id_usuario: { in: ids } } });
      });
    } finally { await prisma.$disconnect(); }
  }
});
