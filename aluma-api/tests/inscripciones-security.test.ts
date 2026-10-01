import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/config/prisma.js';
import authRoutes from '../src/routes/auth/routes.js';
import enrollmentRoutes from '../src/routes/inscripcion-actividad/routes.js';
import movementRoutes from '../src/routes/movimiento-contable/routes.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';

// Integracion real: solo se escriben y limpian fixtures creadas por esta ejecucion.
test('Permisos y consistencia contable de inscripciones', async (t) => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/inscripciones', enrollmentRoutes);
  app.use('/api/movimientos', movementRoutes);
  app.use(errorMiddleware);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api`;
  const marker = `test-${randomUUID().slice(0, 8)}`;
  const users: number[] = [];
  const activities: number[] = [];
  const independentMovements: number[] = [];
  const tokens: Record<string, string> = {};
  const ids: Record<string, number> = {};

  async function request(method: string, path: string, role?: string, body?: unknown) {
    const response = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(role && { Authorization: `Bearer ${tokens[role] ?? role}` }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const result = response.status === 204 ? null : await response.json();
    return { status: response.status, body: result };
  }
  function expectStatus(result: { status: number; body: unknown }, status: number) {
    assert.equal(result.status, status, JSON.stringify(result.body));
  }

  try {
    const loginStatus = await prisma.estadoUsuario.findFirstOrThrow({ where: { permiteLogin: true } });
    const documentType = await prisma.tipoDocumentoIdentificacion.findFirstOrThrow();
    const activityStatus = await prisma.estadoActividad.findFirstOrThrow();
    const method = await prisma.metodoPago.findFirstOrThrow();
    const pending = await prisma.estadoPago.findUniqueOrThrow({ where: { nombre_estado: 'Pendiente' } });
    const paid = await prisma.estadoPago.findUniqueOrThrow({ where: { nombre_estado: 'Pagado' } });
    const refunded = await prisma.estadoPago.findUniqueOrThrow({ where: { nombre_estado: 'Devolución' } });
    const cancelled = await prisma.estadoPago.findUniqueOrThrow({ where: { nombre_estado: 'Cancelado' } });
    const closed = await prisma.estadoInscripcion.findUniqueOrThrow({ where: { nombre: 'Cerrada' } });
    const active = await prisma.estadoInscripcion.findUniqueOrThrow({ where: { nombre: 'Activa' } });
    const adjustment = await prisma.tipoMovimiento.findUniqueOrThrow({ where: { nombre: 'Ajuste' } });
    const password = randomUUID();
    const hash = await bcrypt.hash(password, 4);
    for (const role of ['Usuario', 'Operador', 'Administrador']) {
      const dbRole = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: role } });
      const email = `${marker}-${role}@aluma.test`;
      const user = await prisma.usuario.create({ data: {
        id_tipo_documento: documentType.id_tipo_documento, numeroDocumento: `${marker}-${users.length}`,
        nombre: marker, email, id_rol: dbRole.id_rol, socio: false,
        id_estado_usuario: loginStatus.id_estado_usuario, matriculaPagada: false,
      } });
      users.push(user.id_usuario);
      ids[role] = user.id_usuario;
      await prisma.cuentaAutenticacion.create({ data: {
        id_usuario: user.id_usuario, proveedor: 'local', email, password_hash: hash,
      } });
      const login = await request('POST', '/auth/login', undefined, { email, password });
      expectStatus(login, 200);
      assert.equal(typeof login.body.token, 'string');
      tokens[role] = login.body.token;
    }
    for (let i = 0; i < 5; i++) {
      const activity = await prisma.actividad.create({ data: {
        titulo: `${marker}-${i}`, id_estado_actividad: activityStatus.id_estado_actividad,
      } });
      activities.push(activity.id_actividad);
    }
    const payload = (activityId: number, userId = ids.Usuario!) => ({
      id_usuario: userId, id_actividad: activityId, id_estado_pago: pending.id_estado_pago,
      precioAplicado: 25, apuntadoFecha: '2026-10-01',
    });
    const payment = {
      id_estado_pago: paid.id_estado_pago, id_metodo_pago: method.id_metodo_pago, fechaPago: '2026-10-01',
    };
    let owned = 0;
    let other = 0;
    let chargeId = 0;

    await t.test('Todas las rutas requieren JWT; Usuario no actualiza, borra ni accede a movimientos', async () => {
      for (const module of ['/inscripciones', '/movimientos']) {
        for (const [verb, path] of [['GET', module], ['GET', `${module}/1`], ['POST', module], ['PUT', `${module}/1`], ['DELETE', `${module}/1`]]) {
          expectStatus(await request(verb!, path!), 401);
          expectStatus(await request(verb!, path!, 'invalid-token'), 401);
          if (module === '/movimientos' || verb === 'PUT' || verb === 'DELETE') {
            expectStatus(await request(verb!, path!, 'Usuario', verb === 'GET' ? undefined : {}), 403);
          }
        }
      }
    });
    await t.test('Usuario crea para si mismo, no para otro y no duplica una inscripcion activa', async () => {
      const body = payload(activities[4]!);
      const created = await request('POST', '/inscripciones', 'Usuario', body);
      expectStatus(created, 201);
      assert.equal(created.body.id_usuario, ids.Usuario);
      assert.equal(created.body.id_estado_inscripcion, active.id_estado_inscripcion);

      const duplicate = await request('POST', '/inscripciones', 'Usuario', body);
      expectStatus(duplicate, 409);
      assert.equal(duplicate.body.code, 'ACTIVE_ENROLLMENT_ALREADY_EXISTS');

      for (const userId of [ids.Operador, ids.Administrador]) {
        expectStatus(await request('POST', '/inscripciones', 'Usuario', payload(activities[4]!, userId)), 403);
      }
    });
    await t.test('POST de Operador y Administrador para otros usuarios; listado y detalle por propietario', async () => {
      const one = await request('POST', '/inscripciones', 'Operador', payload(activities[0]!));
      expectStatus(one, 201); owned = one.body.id_inscripcion;
      const two = await request('POST', '/inscripciones', 'Administrador', payload(activities[0]!, ids.Operador));
      expectStatus(two, 201); other = two.body.id_inscripcion;
      const list = await request('GET', '/inscripciones?id_usuario=' + ids.Operador, 'Usuario');
      expectStatus(list, 200);
      assert(list.body.some((row: { id_inscripcion: number }) => row.id_inscripcion === owned));
      assert(list.body.every((row: { id_usuario: number }) => row.id_usuario === ids.Usuario));
      expectStatus(await request('GET', `/inscripciones/${owned}`, 'Usuario'), 200);
      expectStatus(await request('GET', `/inscripciones/${other}`, 'Usuario'), 403);
      for (const role of ['Operador', 'Administrador']) {
        const all = await request('GET', '/inscripciones', role);
        expectStatus(all, 200);
        assert(all.body.some((row: { id_inscripcion: number }) => row.id_inscripcion === other));
        expectStatus(await request('GET', `/inscripciones/${owned}`, role), 200);
        expectStatus(await request('GET', `/inscripciones/${other}`, role), 200);
      }
      expectStatus(await request('GET', '/inscripciones/1.5', 'Administrador'), 400);
      expectStatus(await request('GET', '/inscripciones/2147483647', 'Administrador'), 404);
    });
    await t.test('Sin cobro no hay devolución; referencias, duplicados e importes se validan', async () => {
      expectStatus(await request('PUT', `/inscripciones/${owned}`, 'Operador', { id_estado_pago: refunded.id_estado_pago }), 409);
      expectStatus(await request('POST', '/inscripciones', 'Operador', { ...payload(activities[1]!), id_estado_pago: refunded.id_estado_pago }), 409);
      expectStatus(await request('POST', '/inscripciones', 'Operador', payload(activities[0]!)), 409);
      expectStatus(await request('PUT', `/inscripciones/${other}`, 'Operador', { id_usuario: ids.Usuario }), 409);
      expectStatus(await request('PUT', `/inscripciones/${owned}`, 'Operador', { id_actividad: 2147483647 }), 404);
      expectStatus(await request('PUT', `/inscripciones/${owned}`, 'Operador', { precioAplicado: 1.001 }), 400);
      expectStatus(await request('PUT', `/inscripciones/${owned}`, 'Operador', { desconocido: true }), 400);
      expectStatus(await request('PUT', `/inscripciones/${owned}`, 'Operador', { id_estado_pago: paid.id_estado_pago }), 400);
      expectStatus(await request('PUT', `/inscripciones/${owned}`, 'Operador', { ...payment, precioAplicado: 0 }), 400);
      assert.equal(await prisma.movimientoContable.count({ where: { id_inscripcion: owned } }), 0);
    });
    await t.test('Cambios previos al cobro y transición Cancelado/Pendiente sin movimientos', async () => {
      expectStatus(await request('PUT', `/inscripciones/${owned}`, 'Operador', {
        id_estado_pago: cancelled.id_estado_pago, precioAplicado: 30, comentario: 'correccion',
        id_actividad: activities[1], id_usuario: ids.Administrador,
        id_metodo_pago: method.id_metodo_pago, fechaPago: '2026-10-02',
      }), 200);
      expectStatus(await request('GET', `/inscripciones/${owned}`, 'Usuario'), 403);
      expectStatus(await request('PUT', `/inscripciones/${owned}`, 'Administrador', {
        ...payload(activities[0]!), id_metodo_pago: null, fechaPago: null,
      }), 200);
      assert.equal(await prisma.movimientoContable.count({ where: { id_inscripcion: owned } }), 0);
    });
    await t.test('Cobros concurrentes generan un único movimiento', async () => {
      const results = await Promise.all([
        request('PUT', `/inscripciones/${owned}`, 'Operador', payment),
        request('PUT', `/inscripciones/${owned}`, 'Administrador', payment),
      ]);
      for (const result of results) expectStatus(result, 200);
      const charges = await prisma.movimientoContable.findMany({ where: { id_inscripcion: owned } });
      assert.equal(charges.length, 1); assert.equal(Number(charges[0]!.importe), 25);
      chargeId = charges[0]!.id_movimiento;
    });
    await t.test('Después del cobro: solo comentario o devolución; DELETE protegido', async () => {
      for (const body of [
        { id_usuario: ids.Operador }, { id_actividad: activities[1] }, { precioAplicado: 26 },
        { id_metodo_pago: null }, { fechaPago: null }, { fechaPago: '2026-10-02' },
        { apuntadoFecha: '2026-10-02' }, { id_estado_inscripcion: closed.id_estado_inscripcion },
        { id_estado_pago: pending.id_estado_pago }, { id_estado_pago: cancelled.id_estado_pago },
      ]) expectStatus(await request('PUT', `/inscripciones/${owned}`, 'Administrador', body), 409);
      expectStatus(await request('PUT', `/inscripciones/${owned}`, 'Operador', { comentario: 'nota' }), 200);
      expectStatus(await request('DELETE', `/inscripciones/${owned}`, 'Administrador'), 409);
      expectStatus(await request('DELETE', `/inscripciones/${other}`, 'Operador'), 403);
      expectStatus(await request('DELETE', `/inscripciones/${other}`, 'Administrador'), 204);
    });
    await t.test('No se pueden crear, cambiar, desvincular ni borrar movimientos de inscripción', async () => {
      for (const role of ['Operador', 'Administrador']) {
        expectStatus(await request('GET', '/movimientos', role), 200);
        expectStatus(await request('GET', `/movimientos/${chargeId}`, role), 200);
        expectStatus(await request('POST', '/movimientos', role, {
          id_tipo_movimiento: adjustment.id_tipo_movimiento, concepto: marker, importe: 1,
          fecha: '2026-10-01', id_inscripcion: owned,
        }), 409);
        for (const body of [{ importe: 999 }, { id_inscripcion: null }, { comentario: 'cambio' }]) {
          expectStatus(await request('PUT', `/movimientos/${chargeId}`, role, body), 409);
        }
      }
      expectStatus(await request('DELETE', `/movimientos/${chargeId}`, 'Administrador'), 409);
      expectStatus(await request('DELETE', `/movimientos/${chargeId}`, 'Operador'), 403);
    });
    await t.test('Devoluciones concurrentes: importe del cobro, cierre persistido y una sola devolución', async () => {
      expectStatus(await request('PUT', `/inscripciones/${owned}`, 'Operador', {
        id_estado_pago: refunded.id_estado_pago, id_estado_inscripcion: active.id_estado_inscripcion,
      }), 409);
      const results = await Promise.all(['Operador', 'Administrador'].map((role) => request('PUT', `/inscripciones/${owned}`, role, {
        id_estado_pago: refunded.id_estado_pago,
      })));
      for (const result of results) { expectStatus(result, 200); assert.equal(result.body.id_estado_inscripcion, closed.id_estado_inscripcion); }
      const movements = await prisma.movimientoContable.findMany({ where: { id_inscripcion: owned } });
      assert.equal(movements.length, 2);
      assert.equal(movements.reduce((sum, row) => sum + Number(row.importe), 0), 0);
      expectStatus(await request('PUT', `/inscripciones/${owned}`, 'Operador', { comentario: 'devuelta' }), 200);
      for (const body of [{ id_estado_pago: paid.id_estado_pago }, { id_estado_inscripcion: active.id_estado_inscripcion }, { precioAplicado: 1 }]) {
        expectStatus(await request('PUT', `/inscripciones/${owned}`, 'Administrador', body), 409);
      }
      expectStatus(await request('DELETE', `/inscripciones/${owned}`, 'Administrador'), 409);
    });
    await t.test('Usuario se reinscribe tras Devolucion/Cerrada con nuevo ID y conserva el historico', async () => {
      const previous = await request('GET', `/inscripciones/${owned}`, 'Usuario');
      expectStatus(previous, 200);
      assert.equal(previous.body.id_estado_pago, refunded.id_estado_pago);
      assert.equal(previous.body.id_estado_inscripcion, closed.id_estado_inscripcion);
      const before = await request('GET', '/movimientos', 'Administrador');
      expectStatus(before, 200);
      const history = before.body.filter((row: { id_inscripcion: number }) => row.id_inscripcion === owned);
      assert.equal(history.length, 2);

      const created = await request('POST', '/inscripciones', 'Usuario', payload(activities[0]!));
      expectStatus(created, 201);
      assert.notEqual(created.body.id_inscripcion, owned);
      assert.equal(created.body.id_usuario, ids.Usuario);
      assert.equal(created.body.id_actividad, previous.body.id_actividad);
      assert.equal(created.body.id_estado_inscripcion, active.id_estado_inscripcion);
      assert.equal(created.body.id_estado_pago, pending.id_estado_pago);

      // Repetir la devolucion antigua tampoco afecta a la nueva inscripcion.
      expectStatus(await request('PUT', `/inscripciones/${owned}`, 'Administrador', {
        id_estado_pago: refunded.id_estado_pago,
      }), 200);
      const historical = await request('GET', `/inscripciones/${owned}`, 'Usuario');
      expectStatus(historical, 200);
      assert.deepEqual(historical.body, previous.body);
      const current = await request('GET', `/inscripciones/${created.body.id_inscripcion}`, 'Usuario');
      expectStatus(current, 200);
      assert.deepEqual(current.body, created.body);
      const after = await request('GET', '/movimientos', 'Administrador');
      expectStatus(after, 200);
      assert.deepEqual(after.body.filter((row: { id_inscripcion: number }) => row.id_inscripcion === owned), history);
      assert.equal(after.body.filter((row: { id_inscripcion: number }) => row.id_inscripcion === created.body.id_inscripcion).length, 0);
      const duplicate = await request('POST', '/inscripciones', 'Usuario', payload(activities[0]!));
      expectStatus(duplicate, 409);
      assert.equal(duplicate.body.code, 'ACTIVE_ENROLLMENT_ALREADY_EXISTS');
    });
    await t.test('POST pagado crea cobro atómico; error no deja inscripción', async () => {
      const result = await request('POST', '/inscripciones', 'Administrador', { ...payload(activities[1]!), ...payment });
      expectStatus(result, 201);
      assert.equal(await prisma.movimientoContable.count({ where: { id_inscripcion: result.body.id_inscripcion } }), 1);
      expectStatus(await request('POST', '/inscripciones', 'Administrador', {
        ...payload(activities[2]!), ...payment, id_metodo_pago: 2147483647,
      }), 404);
      assert.equal(await prisma.inscripcionActividad.count({ where: { id_actividad: activities[2] } }), 0);
    });
    await t.test('Creaciones concurrentes no duplican la inscripción activa', async () => {
      const results = await Promise.all(['Operador', 'Administrador'].map((role) =>
        request('POST', '/inscripciones', role, payload(activities[3]!))));
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      assert.equal(await prisma.inscripcionActividad.count({ where: { id_actividad: activities[3] } }), 1);
    });
    await t.test('Movimientos independientes mantienen permisos y no pueden asociarse posteriormente', async () => {
      for (const role of ['Operador', 'Administrador']) {
        const result = await request('POST', '/movimientos', role, {
          id_tipo_movimiento: adjustment.id_tipo_movimiento, concepto: marker, importe: 5, fecha: '2026-10-01',
        });
        expectStatus(result, 201);
        const id = result.body.id_movimiento; independentMovements.push(id);
        expectStatus(await request('PUT', `/movimientos/${id}`, role, { importe: 6 }), 200);
        expectStatus(await request('PUT', `/movimientos/${id}`, role, { id_inscripcion: owned }), 409);
        expectStatus(await request('DELETE', `/movimientos/${id}`, 'Operador'), 403);
        expectStatus(await request('DELETE', `/movimientos/${id}`, 'Administrador'), 204);
      }
    });
  } finally {
    server.close();
    server.closeAllConnections();
    await once(server, 'close');
    await prisma.$transaction(async (tx) => {
      const fixtureEnrollments = await tx.inscripcionActividad.findMany({
        where: { id_actividad: { in: activities }, id_usuario: { in: users } }, select: { id_inscripcion: true },
      });
      const enrollmentIds = fixtureEnrollments.map((row) => row.id_inscripcion);
      await tx.movimientoContable.deleteMany({ where: { OR: [
        { id_inscripcion: { in: enrollmentIds } }, { id_movimiento: { in: independentMovements } },
      ] } });
      await tx.inscripcionActividad.deleteMany({ where: { id_inscripcion: { in: enrollmentIds } } });
      await tx.actividad.deleteMany({ where: { id_actividad: { in: activities } } });
      await tx.cuentaAutenticacion.deleteMany({ where: { id_usuario: { in: users } } });
      await tx.usuario.deleteMany({ where: { id_usuario: { in: users } } });
    });
    await prisma.$disconnect();
  }
});
