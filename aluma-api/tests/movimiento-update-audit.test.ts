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

test('Modificacion HTTP de movimientos independientes y auditoria atomica', async (t) => {
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
  const marker = `mu-${randomUUID().slice(0, 8)}`;
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
    return { status: response.status, body: await response.json(), requestId: id };
  }
  try {
    const state = await prisma.estadoUsuario.findFirstOrThrow({ where: { permiteLogin: true } });
    const document = await prisma.tipoDocumentoIdentificacion.findFirstOrThrow();
    const chargeType = await prisma.tipoMovimiento.findUniqueOrThrow({ where: { nombre: 'Cobro' } });
    const refundType = await prisma.tipoMovimiento.findUniqueOrThrow({ where: { nombre: 'Devolución' } });
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
    const admin = actors.find(actor => actor.role === 'Administrador')!;
    const operator = actors.find(actor => actor.role === 'Operador')!;
    const user = actors.find(actor => actor.role === 'Usuario')!;
    for (const actor of [operator, admin]) {
      await t.test(actor.role === 'Administrador' ? 'Administrador: modificacion, contexto y diferencias reales; repeticion sin auditoria' : 'Operador: modificacion rechazada sin cambios ni auditoria', async () => {
        const before = await fixture();
        const path = `/movimientos/${before.id_movimiento}`;
        const body = { id_tipo_movimiento: refundType.id_tipo_movimiento, importe: -12.5,
          fecha: '2026-10-04', concepto: 'Concepto privado nuevo', comentario: null, id_inscripcion: null };
        const result = await request('PUT', path, body, actor.token);
        if (actor.role === 'Operador') {
          assert.equal(result.status, 403);
          assert.equal(result.body.code, 'FORBIDDEN');
          assert.deepEqual(await prisma.movimientoContable.findUnique({ where: { id_movimiento: before.id_movimiento } }), before);
          assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
          return;
        }
        assert.equal(result.status, 200);
        const updated = await prisma.movimientoContable.findUniqueOrThrow({ where: { id_movimiento: before.id_movimiento } });
        assert.equal(updated.importe.toFixed(2), '-12.50');
        assert.equal(updated.concepto, body.concepto);
        assert.equal(updated.comentario, null);
        const audits = await prisma.auditoria.findMany({ where: { requestId: result.requestId } });
        assert.equal(audits.length, 1);
        const audit = audits[0]!;
        assert.equal(audit.requestId, result.requestId);
        assert.equal(audit.id_usuario, actor.id);
        assert.equal(audit.rol_actor, actor.role);
        assert.equal(audit.accion, 'MOVIMIENTO_MODIFICADO');
        assert.equal(audit.recurso, 'MOVIMIENTO_CONTABLE');
        assert.equal(audit.id_recurso, before.id_movimiento);
        assert.equal(audit.resultado, 'REALIZADA');
        assert.equal(audit.codigo_error, null);
        assert.deepEqual(audit.detalles, { cambios: {
          id_tipo_movimiento: { anterior: chargeType.id_tipo_movimiento, nuevo: refundType.id_tipo_movimiento },
          importe: { anterior: '10.00', nuevo: '-12.50' },
          fecha: { anterior: '2026-10-03', nuevo: '2026-10-04' },
          concepto: { anterior: '[REDACTADO]', nuevo: '[REDACTADO]' },
          comentario: { anterior: '[REDACTADO]', nuevo: null },
        } });
        const repeated = await request('PUT', path, { ...body, concepto: `  ${body.concepto}  ` }, actor.token);
        assert.equal(repeated.status, 200);
        assert.equal(await prisma.auditoria.count({ where: { requestId: repeated.requestId } }), 0);
        assert.deepEqual(await prisma.movimientoContable.findUnique({ where: { id_movimiento: before.id_movimiento } }), updated);
      });
    }
    await t.test('Solo comentario: diferencias sin texto sensible; sin cambios normalizados no audita', async () => {
      const before = await fixture();
      const path = `/movimientos/${before.id_movimiento}`;
      const result = await request('PUT', path, { comentario: 'Nuevo texto privado' }, admin.token);
      assert.equal(result.status, 200);
      const audit = await prisma.auditoria.findFirstOrThrow({ where: { requestId: result.requestId } });
      assert.deepEqual(audit.detalles, { cambios: { comentario: { anterior: '[REDACTADO]', nuevo: '[REDACTADO]' } } });
      const repeated = await request('PUT', path, { comentario: '  Nuevo texto privado  ', importe: 10,
        fecha: '2026-10-03T00:00:00.000Z', id_inscripcion: null }, admin.token);
      assert.equal(repeated.status, 200);
      assert.equal(await prisma.auditoria.count({ where: { requestId: repeated.requestId } }), 0);
    });
    for (const afterInsert of [false, true]) {
      await t.test(`Rollback ${afterInsert ? 'despues' : 'antes'} de insertar auditoria`, async (subtest) => {
        const before = await fixture();
        const where = { id_movimiento: before.id_movimiento };
        const failure = new Error('Fallo controlado de auditoria de modificacion');
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
              assert.equal((await tx.movimientoContable.findUniqueOrThrow({ where })).importe.toFixed(2), '15.00');
              assert.deepEqual(await prisma.movimientoContable.findUnique({ where }), before);
              assert.equal(args.data.accion, 'MOVIMIENTO_MODIFICADO');
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
          const result = await request('PUT', `/movimientos/${before.id_movimiento}`, { importe: 15 }, admin.token);
          assert.equal(result.status, 500);
          assert.equal(calls, 1);
          assert.equal(inserted, afterInsert);
          assert(logMock.mock.calls.some(call => String(call.arguments[0]).includes('INTERNAL_SERVER_ERROR')));
          assert(!logMock.mock.calls.some(call => call.arguments.includes(failure)));
          assert.deepEqual(await prisma.movimientoContable.findUnique({ where }), before);
          assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
        } finally {
          prisma.$transaction = transactionMethod;
          logMock.mock.restore();
        }
      });
    }
    await t.test('Permisos, validaciones y asociacion rechazada sin auditoria', async () => {
      const before = await fixture();
      const invalidType = 2147483647;
      assert.equal(await prisma.tipoMovimiento.findUnique({ where: { id_tipo_movimiento: invalidType } }), null);
      const cases = [
        { body: { importe: 11 }, token: undefined, status: 401 },
        { body: { importe: 11 }, token: 'invalid-token', status: 401 },
        { body: { importe: 11 }, token: operator.token, status: 403 },
        { body: { importe: 11 }, token: user.token, status: 403 },
        { body: {}, token: admin.token, status: 400 },
        { body: { fecha: 'invalid' }, token: admin.token, status: 400 },
        { body: { importe: -1 }, token: admin.token, status: 400 },
        { body: { id_tipo_movimiento: refundType.id_tipo_movimiento }, token: admin.token, status: 400 },
        { body: { id_tipo_movimiento: invalidType }, token: admin.token, status: 404 },
        { body: { id_inscripcion: 1 }, token: admin.token, status: 409 },
      ];
      for (const item of cases) {
        const result = await request('PUT', `/movimientos/${before.id_movimiento}`, item.body, item.token);
        assert.equal(result.status, item.status, JSON.stringify(result.body));
        assert.deepEqual(await prisma.movimientoContable.findUnique({ where: { id_movimiento: before.id_movimiento } }), before);
        assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
      }
      const absentId = 2147483647;
      assert.equal(await prisma.movimientoContable.findUnique({ where: { id_movimiento: absentId } }), null);
      const absent = await request('PUT', `/movimientos/${absentId}`, { importe: 11 }, admin.token);
      assert.equal(absent.status, 404);
      assert.equal(absent.body.code, 'ACCOUNTING_MOVEMENT_NOT_FOUND');
      assert.equal(await prisma.auditoria.count({ where: { requestId: absent.requestId } }), 0);
    });
    await t.test('Movimiento vinculado: no modificar ni desvincular; sin auditoria', async () => {
      const activityState = await prisma.estadoActividad.findFirstOrThrow();
      const activity = await prisma.actividad.create({ data: { titulo: marker, id_estado_actividad: activityState.id_estado_actividad } });
      activityIds.push(activity.id_actividad);
      const paymentState = await prisma.estadoPago.findUniqueOrThrow({ where: { nombre_estado: 'Pagado' } });
      const enrollmentState = await prisma.estadoInscripcion.findUniqueOrThrow({ where: { nombre: 'Activa' } });
      const enrollment = await prisma.inscripcionActividad.create({ data: {
        id_usuario: operator.id, id_actividad: activity.id_actividad,
        id_estado_pago: paymentState.id_estado_pago, id_estado_inscripcion: enrollmentState.id_estado_inscripcion,
        apuntadoFecha: new Date('2026-10-03'),
      } });
      enrollmentIds.push(enrollment.id_inscripcion);
      const before = await fixture(enrollment.id_inscripcion);
      for (const actor of actors) {
        for (const body of [{ importe: 11 }, { comentario: 'cambio' }, { id_inscripcion: null }]) {
          const result = await request('PUT', `/movimientos/${before.id_movimiento}`, body, actor.token);
          assert.equal(result.status, actor.role === 'Administrador' ? 409 : 403);
          assert.equal(result.body.code, actor.role === 'Administrador' ? 'ENROLLMENT_MOVEMENT_PROTECTED' : 'FORBIDDEN');
          assert.deepEqual(await prisma.movimientoContable.findUnique({ where: { id_movimiento: before.id_movimiento } }), before);
          assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
        }
      }
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
