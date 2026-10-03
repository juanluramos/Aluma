import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/config/prisma.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { requestId } from '../src/middlewares/request-id.middleware.js';
import authRoutes from '../src/routes/auth/routes.js';
import enrollmentRoutes from '../src/routes/inscripcion-actividad/routes.js';
import movementRoutes from '../src/routes/movimiento-contable/routes.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';

// Integracion real: solo se escriben y limpian fixtures creadas por esta ejecucion.
test('Permisos y consistencia contable de inscripciones', async (t) => {
  const app = express();
  app.use(requestId);
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
  const requestIds: string[] = [];

  async function request(method: string, path: string, role?: string, body?: unknown) {
    const response = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(role && { Authorization: `Bearer ${tokens[role] ?? role}` }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const id = response.headers.get('x-request-id');
    assert(id);
    requestIds.push(id);
    const result = response.status === 204 ? null : await response.json();
    return { status: response.status, body: result, requestId: id };
  }
  function expectStatus(result: { status: number; body: unknown }, status: number) {
    assert.equal(result.status, status, JSON.stringify(result.body));
  }

  async function checkCreationAudit(result: { requestId: string }, enrollmentId: number, role: string, paid = false) {
    const audits = await prisma.auditoria.findMany({ where: { requestId: result.requestId }, orderBy: { id_auditoria: 'asc' } });
    assert.deepEqual(audits.map(row => row.accion), paid ? ['INSCRIPCION_CREADA', 'INSCRIPCION_COBRADA'] : ['INSCRIPCION_CREADA']);
    for (const audit of audits) {
      assert.equal(audit.requestId, result.requestId);
      assert.equal(audit.id_usuario, ids[role]);
      assert.equal(audit.rol_actor, role);
      assert.equal(audit.recurso, 'INSCRIPCION_ACTIVIDAD');
      assert.equal(audit.id_recurso, enrollmentId);
      assert.equal(audit.resultado, 'REALIZADA');
      assert.equal(audit.codigo_error, null);
    }
    assert.equal(audits[0]!.detalles, null);
    if (paid) {
      const movements = await prisma.movimientoContable.findMany({ where: { id_inscripcion: enrollmentId } });
      assert.equal(movements.length, 1);
      assert.deepEqual(audits[1]!.detalles, { importe: movements[0]!.importe.toFixed(2), id_movimiento: movements[0]!.id_movimiento });
    }
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
      await checkCreationAudit(created, created.body.id_inscripcion, 'Usuario');

      const duplicate = await request('POST', '/inscripciones', 'Usuario', body);
      expectStatus(duplicate, 409);
      assert.equal(duplicate.body.code, 'ACTIVE_ENROLLMENT_ALREADY_EXISTS');
      assert.equal(await prisma.auditoria.count({ where: { requestId: duplicate.requestId } }), 0);

      for (const userId of [ids.Operador, ids.Administrador]) {
        expectStatus(await request('POST', '/inscripciones', 'Usuario', payload(activities[4]!, userId)), 403);
      }
    });
    await t.test('POST de Operador y Administrador para otros usuarios; listado y detalle por propietario', async () => {
      const one = await request('POST', '/inscripciones', 'Operador', payload(activities[0]!));
      expectStatus(one, 201); owned = one.body.id_inscripcion;
      const two = await request('POST', '/inscripciones', 'Administrador', payload(activities[0]!, ids.Operador));
      expectStatus(two, 201); other = two.body.id_inscripcion;
      await checkCreationAudit(one, owned, 'Operador');
      await checkCreationAudit(two, other, 'Administrador');
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
      const rejected = await request('PUT', `/inscripciones/${owned}`, 'Operador', { id_estado_pago: refunded.id_estado_pago });
      expectStatus(rejected, 409);
      assert.equal(rejected.body.code, 'VALID_CHARGE_REQUIRED');
      assert.equal(await prisma.auditoria.count({ where: { requestId: rejected.requestId } }), 0);
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
      const before = await prisma.inscripcionActividad.findUniqueOrThrow({ where: { id_inscripcion: owned } });
      for (const [role, body, expected] of [
        ['Usuario', payment, 403],
        ['Operador', { id_estado_pago: paid.id_estado_pago }, 400],
        ['Administrador', { ...payment, precioAplicado: 0 }, 400],
      ] as const) {
        const rejected = await request('PUT', `/inscripciones/${owned}`, role, body);
        expectStatus(rejected, expected);
        assert.equal(await prisma.auditoria.count({ where: { requestId: rejected.requestId } }), 0);
        assert.equal(await prisma.movimientoContable.count({ where: { id_inscripcion: owned } }), 0);
        assert.deepEqual(await prisma.inscripcionActividad.findUniqueOrThrow({ where: { id_inscripcion: owned } }), before);
      }
      const results = await Promise.all([
        request('PUT', `/inscripciones/${owned}`, 'Operador', payment),
        request('PUT', `/inscripciones/${owned}`, 'Administrador', payment),
      ]);
      for (const result of results) expectStatus(result, 200);
      const charges = await prisma.movimientoContable.findMany({ where: { id_inscripcion: owned } });
      assert.equal(charges.length, 1); assert.equal(Number(charges[0]!.importe), 25);
      chargeId = charges[0]!.id_movimiento;
      const audits = await prisma.auditoria.findMany({ where: { requestId: { in: results.map(r => r.requestId) } } });
      assert.equal(audits.length, 1);
      const audit = audits[0]!;
      const role = audit.requestId === results[0]!.requestId ? 'Operador' : 'Administrador';
      assert.equal(audit.id_usuario, ids[role]);
      assert.equal(audit.rol_actor, role);
      assert.equal(audit.accion, 'INSCRIPCION_COBRADA');
      assert.equal(audit.recurso, 'INSCRIPCION_ACTIVIDAD');
      assert.equal(audit.id_recurso, owned);
      assert.equal(audit.resultado, 'REALIZADA');
      assert.equal(audit.codigo_error, null);
      assert.deepEqual(audit.detalles, { importe: '25.00', id_movimiento: chargeId });
      const repeated = await request('PUT', `/inscripciones/${owned}`, 'Operador', payment);
      expectStatus(repeated, 200);
      assert.equal(await prisma.auditoria.count({ where: { requestId: repeated.requestId } }), 0);
      assert.equal(await prisma.movimientoContable.count({ where: { id_inscripcion: owned } }), 1);
    });
    await t.test('Después del cobro: solo comentario o devolución; DELETE protegido', async () => {
      for (const body of [
        { id_usuario: ids.Operador }, { id_actividad: activities[1] }, { precioAplicado: 26 },
        { id_metodo_pago: null }, { fechaPago: null }, { fechaPago: '2026-10-02' },
        { apuntadoFecha: '2026-10-02' }, { id_estado_inscripcion: closed.id_estado_inscripcion },
        { id_estado_pago: pending.id_estado_pago }, { id_estado_pago: cancelled.id_estado_pago },
      ]) {
        const rejected = await request('PUT', `/inscripciones/${owned}`, 'Administrador', body);
        expectStatus(rejected, 409);
        assert.equal(await prisma.auditoria.count({ where: { requestId: rejected.requestId } }), 0);
      }
      const comment = await request('PUT', `/inscripciones/${owned}`, 'Operador', { comentario: 'nota' });
      expectStatus(comment, 200);
      const commentAudits = await prisma.auditoria.findMany({ where: { requestId: comment.requestId } });
      assert.equal(commentAudits.length, 1);
      assert.equal(commentAudits[0]!.accion, 'INSCRIPCION_MODIFICADA');
      assert.equal(commentAudits[0]!.id_usuario, ids.Operador);
      assert.equal(commentAudits[0]!.rol_actor, 'Operador');
      assert.equal(commentAudits[0]!.id_recurso, owned);
      assert.deepEqual(commentAudits[0]!.detalles, { cambios: { comentario: { modificado: true } } });
      const sameComment = await request('PUT', `/inscripciones/${owned}`, 'Operador', { comentario: ' nota ' });
      expectStatus(sameComment, 200);
      assert.equal(await prisma.auditoria.count({ where: { requestId: sameComment.requestId } }), 0);
      const before = await prisma.inscripcionActividad.findUniqueOrThrow({ where: { id_inscripcion: owned } });
      const movements = await prisma.movimientoContable.findMany({ where: { id_inscripcion: owned } });
      const rejected = await request('DELETE', `/inscripciones/${owned}`, 'Administrador');
      expectStatus(rejected, 409);
      assert.equal(rejected.body.code, 'ENROLLMENT_HAS_MOVEMENTS');
      assert.deepEqual(await prisma.inscripcionActividad.findUnique({ where: { id_inscripcion: owned } }), before);
      assert.deepEqual(await prisma.movimientoContable.findMany({ where: { id_inscripcion: owned } }), movements);
      assert.equal(await prisma.auditoria.count({ where: { requestId: rejected.requestId } }), 0);
      const forbidden = await request('DELETE', `/inscripciones/${other}`, 'Operador');
      expectStatus(forbidden, 403);
      assert.equal(await prisma.auditoria.count({ where: { requestId: forbidden.requestId } }), 0);
    });
    await t.test('DELETE correcto: contexto e ID historico tras COMMIT; segundo DELETE sin duplicacion', async () => {
      const result = await request('DELETE', `/inscripciones/${other}`, 'Administrador');
      expectStatus(result, 204);
      assert.equal(await prisma.inscripcionActividad.findUnique({ where: { id_inscripcion: other } }), null);
      const audits = await prisma.auditoria.findMany({ where: { requestId: result.requestId } });
      assert.equal(audits.length, 1);
      const audit = audits[0]!;
      assert.equal(audit.requestId, result.requestId);
      assert.equal(audit.id_usuario, ids.Administrador);
      assert.equal(audit.rol_actor, 'Administrador');
      assert.equal(audit.accion, 'INSCRIPCION_ELIMINADA');
      assert.equal(audit.recurso, 'INSCRIPCION_ACTIVIDAD');
      assert.equal(audit.id_recurso, other);
      assert.equal(audit.resultado, 'REALIZADA');
      assert.equal(audit.codigo_error, null);
      assert.equal(audit.detalles, null);
      const second = await request('DELETE', `/inscripciones/${other}`, 'Administrador');
      expectStatus(second, 404);
      assert.equal(second.body.code, 'ENROLLMENT_NOT_FOUND');
      assert.equal(await prisma.auditoria.count({ where: { requestId: second.requestId } }), 0);
      assert.deepEqual(await prisma.auditoria.findMany({ where: {
        accion: 'INSCRIPCION_ELIMINADA', recurso: 'INSCRIPCION_ACTIVIDAD', id_recurso: other,
      } }), audits);
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
      const refundMovement = movements.find(row => Number(row.importe) < 0)!;
      assert.equal(refundMovement.importe.toFixed(2), '-25.00');
      const audits = await prisma.auditoria.findMany({ where: { requestId: { in: results.map(row => row.requestId) } } });
      assert.equal(audits.length, 1);
      const audit = audits[0]!;
      const role = audit.requestId === results[0]!.requestId ? 'Operador' : 'Administrador';
      assert.equal(audit.id_usuario, ids[role]);
      assert.equal(audit.rol_actor, role);
      assert.equal(audit.accion, 'INSCRIPCION_DEVUELTA');
      assert.equal(audit.recurso, 'INSCRIPCION_ACTIVIDAD');
      assert.equal(audit.id_recurso, owned);
      assert.equal(audit.resultado, 'REALIZADA');
      assert.equal(audit.codigo_error, null);
      assert.deepEqual(audit.detalles, { importe: '-25.00', id_movimiento: refundMovement.id_movimiento });
      const repeated = await request('PUT', `/inscripciones/${owned}`, 'Operador', { id_estado_pago: refunded.id_estado_pago });
      expectStatus(repeated, 200);
      assert.equal(await prisma.auditoria.count({ where: { requestId: repeated.requestId } }), 0);
      assert.deepEqual(await prisma.movimientoContable.findMany({ where: { id_inscripcion: owned } }), movements);
      expectStatus(await request('PUT', `/inscripciones/${owned}`, 'Operador', { comentario: 'devuelta' }), 200);
      for (const body of [{ id_estado_pago: paid.id_estado_pago }, { id_estado_inscripcion: active.id_estado_inscripcion }, { precioAplicado: 1 }]) {
        expectStatus(await request('PUT', `/inscripciones/${owned}`, 'Administrador', body), 409);
      }
      expectStatus(await request('DELETE', `/inscripciones/${owned}`, 'Administrador'), 409);
    });
    await t.test('Usuario se reinscribe tras Devolucion/Cerrada con nuevo ID y conserva el historico', async () => {
      const previous = await request('GET', `/inscripciones/${owned}`, 'Usuario');
      const oldAudits = await prisma.auditoria.findMany({ where: { recurso: 'INSCRIPCION_ACTIVIDAD', id_recurso: owned } });
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
      await checkCreationAudit(created, created.body.id_inscripcion, 'Usuario');
      assert.deepEqual(await prisma.auditoria.findMany({ where: { recurso: 'INSCRIPCION_ACTIVIDAD', id_recurso: owned } }), oldAudits);
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
      await checkCreationAudit(result, result.body.id_inscripcion, 'Administrador', true);
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
      for (const result of results) {
        assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), result.status === 201 ? 1 : 0);
      }
    });
    await t.test('Modificacion administrativa: contexto, diferencias exactas y ausencia de cambios', async (administrativeTest) => {
      const activity = await prisma.actividad.create({ data: {
        titulo: `${marker}-update`, id_estado_actividad: activityStatus.id_estado_actividad,
      } });
      activities.push(activity.id_actividad);
      const created = await request('POST', '/inscripciones', 'Operador', payload(activity.id_actividad));
      expectStatus(created, 201);
      const id = created.body.id_inscripcion;
      const data = { precioAplicado: 30, comentario: '  ajuste  ', fechaPago: '2026-10-02', id_metodo_pago: method.id_metodo_pago,
        id_usuario: ids.Usuario, id_actividad: activity.id_actividad, apuntadoFecha: '2026-10-01', id_estado_pago: pending.id_estado_pago };
      const result = await request('PUT', `/inscripciones/${id}`, 'Administrador', data);
      expectStatus(result, 200);
      const updated = await prisma.inscripcionActividad.findUniqueOrThrow({ where: { id_inscripcion: id } });
      assert.equal(updated.precioAplicado?.toFixed(2), '30.00');
      const audits = await prisma.auditoria.findMany({ where: { requestId: result.requestId } });
      assert.equal(audits.length, 1);
      const audit = audits[0]!;
      assert.equal(audit.requestId, result.requestId);
      assert.equal(audit.id_usuario, ids.Administrador);
      assert.equal(audit.rol_actor, 'Administrador');
      assert.equal(audit.accion, 'INSCRIPCION_MODIFICADA');
      assert.equal(audit.recurso, 'INSCRIPCION_ACTIVIDAD');
      assert.equal(audit.id_recurso, id);
      assert.equal(audit.resultado, 'REALIZADA');
      assert.equal(audit.codigo_error, null);
      assert.deepEqual(audit.detalles, { cambios: {
        precioAplicado: { anterior: '25.00', nuevo: '30.00' },
        comentario: { modificado: true },
        fechaPago: { anterior: null, nuevo: '2026-10-02' },
        id_metodo_pago: { anterior: null, nuevo: method.id_metodo_pago },
      } });
      const same = await request('PUT', `/inscripciones/${id}`, 'Operador', data);
      expectStatus(same, 200);
      assert.equal(await prisma.auditoria.count({ where: { requestId: same.requestId } }), 0);
      assert.equal(await prisma.movimientoContable.count({ where: { id_inscripcion: id } }), 0);

      const cleared = await request('PUT', `/inscripciones/${id}`, 'Operador', {
        precioAplicado: null, fechaPago: null, id_metodo_pago: null, comentario: null,
      });
      expectStatus(cleared, 200);
      const clearedAudit = await prisma.auditoria.findFirstOrThrow({ where: { requestId: cleared.requestId } });
      assert.deepEqual(clearedAudit.detalles, { cambios: {
        precioAplicado: { anterior: '30.00', nuevo: null },
        fechaPago: { anterior: '2026-10-02', nuevo: null },
        id_metodo_pago: { anterior: method.id_metodo_pago, nuevo: null },
        comentario: { modificado: true },
      } });
      const privateComment = 'Dato sensible de prueba que no debe copiarse a auditoria';
      const privateResult = await request('PUT', `/inscripciones/${id}`, 'Operador', { comentario: privateComment });
      expectStatus(privateResult, 200);
      const privateAudit = await prisma.auditoria.findFirstOrThrow({ where: { requestId: privateResult.requestId } });
      assert.deepEqual(privateAudit.detalles, { cambios: { comentario: { modificado: true } } });
      assert.equal(JSON.stringify(privateAudit.detalles).includes(privateComment), false);

      for (const afterInsert of [false, true]) {
        await administrativeTest.test(`Rollback de modificacion ${afterInsert ? 'despues' : 'antes'} de insertar auditoria`, async (subtest) => {
          const before = await prisma.inscripcionActividad.findUniqueOrThrow({ where: { id_inscripcion: id } });
          const failure = new Error('Fallo controlado de auditoria de modificacion');
          const transactionMethod = prisma.$transaction;
          const originalTransaction = transactionMethod.bind(prisma);
          let calls = 0;
          let inserted = false;
          prisma.$transaction = (async (
            operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
            options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
          ) => originalTransaction(async (tx) => {
            const delegate = tx.auditoria;
            const createMethod = delegate.create;
            delegate.create = (async (args: Prisma.AuditoriaCreateArgs) => {
              calls++;
              assert.equal((await tx.inscripcionActividad.findUniqueOrThrow({ where: { id_inscripcion: id } })).comentario, 'rollback');
              assert.deepEqual(await prisma.inscripcionActividad.findUnique({ where: { id_inscripcion: id } }), before);
              if (afterInsert) {
                await createMethod.call(delegate, args);
                inserted = true;
              }
              throw failure;
            }) as typeof delegate.create;
            try { return await operation(tx); }
            finally { delegate.create = createMethod; }
          }, options)) as typeof prisma.$transaction;
          const logMock = subtest.mock.method(console, 'error', () => {});
          try {
            const failed = await request('PUT', `/inscripciones/${id}`, 'Operador', { comentario: 'rollback' });
            expectStatus(failed, 500);
            assert.equal(calls, 1);
            assert.equal(inserted, afterInsert);
            assert(logMock.mock.calls.some(call => call.arguments.includes(failure)));
            assert.deepEqual(await prisma.inscripcionActividad.findUnique({ where: { id_inscripcion: id } }), before);
            assert.equal(await prisma.auditoria.count({ where: { requestId: failed.requestId } }), 0);
          } finally {
            prisma.$transaction = transactionMethod;
            logMock.mock.restore();
          }
        });
      }
    });
    for (const afterInsert of [false, true]) {
      await t.test(`DELETE rollback ${afterInsert ? 'despues' : 'antes'} de insertar auditoria`, async (subtest) => {
        const target = await prisma.inscripcionActividad.create({ data: {
          id_usuario: ids.Administrador!, id_actividad: activities[2]!,
          id_estado_pago: pending.id_estado_pago, id_estado_inscripcion: closed.id_estado_inscripcion,
          apuntadoFecha: new Date('2026-10-01'),
        } });
        const where = { id_inscripcion: target.id_inscripcion };
        const failure = new Error('Fallo controlado de auditoria de eliminacion');
        const transactionMethod = prisma.$transaction;
        const originalTransaction = transactionMethod.bind(prisma);
        let calls = 0;
        let inserted = false;
        prisma.$transaction = (async (
          operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
        ) => originalTransaction(async (tx) => {
          assert.equal(options?.isolationLevel, 'Serializable');
          const delegate = tx.auditoria;
          const createMethod = delegate.create;
          delegate.create = (async (args: Prisma.AuditoriaCreateArgs) => {
            calls++;
            assert.equal(await tx.inscripcionActividad.findUnique({ where }), null);
            assert.deepEqual(await prisma.inscripcionActividad.findUnique({ where }), target);
            assert.equal(args.data.accion, 'INSCRIPCION_ELIMINADA');
            assert.equal(args.data.id_recurso, target.id_inscripcion);
            if (afterInsert) {
              await createMethod.call(delegate, args);
              inserted = true;
            }
            throw failure;
          }) as typeof delegate.create;
          try { return await operation(tx); }
          finally { delegate.create = createMethod; }
        }, options)) as typeof prisma.$transaction;
        const logMock = subtest.mock.method(console, 'error', () => {});
        try {
          const result = await request('DELETE', `/inscripciones/${target.id_inscripcion}`, 'Administrador');
          expectStatus(result, 500);
          assert.equal(calls, 1);
          assert.equal(inserted, afterInsert);
          assert(logMock.mock.calls.some(call => call.arguments.includes(failure)));
          assert.deepEqual(await prisma.inscripcionActividad.findUnique({ where }), target);
          assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
        } finally {
          prisma.$transaction = transactionMethod;
          logMock.mock.restore();
        }
      });
    }
    for (const operationKind of ['charge', 'refund'] as const) {
      const isRefund = operationKind === 'refund';
      for (const mode of ['movement', 'audit-before', 'audit-after', 'retry', 'retry-exhausted'] as const) {
        await t.test(`${isRefund ? 'Devolucion' : 'Cobro'} atomico: ${mode}`, async (subtest) => {
          const activity = await prisma.actividad.create({ data: {
            titulo: `${marker}-${operationKind}-${mode}`, id_estado_actividad: activityStatus.id_estado_actividad,
          } });
          activities.push(activity.id_actividad);
          const created = await request('POST', '/inscripciones', 'Operador', { ...payload(activity.id_actividad), ...(isRefund && payment) });
          expectStatus(created, 201);
          const where = { id_inscripcion: created.body.id_inscripcion as number };
          const before = await prisma.inscripcionActividad.findUniqueOrThrow({ where });
          const priorMovements = await prisma.movimientoContable.findMany({ where });
          const targetStatus = isRefund ? refunded.id_estado_pago : paid.id_estado_pago;
          const failure = new Error('Fallo controlado de cobro');
          const transactionMethod = prisma.$transaction;
          const originalTransaction = transactionMethod.bind(prisma);
          let attempts = 0;
          let auditCalls = 0;
          prisma.$transaction = (async (
            operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
            options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
          ) => originalTransaction(async (tx) => {
            attempts++;
            assert.equal(options?.isolationLevel, 'Serializable');
            const movementCreate = tx.movimientoContable.create;
            const auditCreate = tx.auditoria.create;
            tx.movimientoContable.create = (async (args: Prisma.MovimientoContableCreateArgs) => {
              const updated = await tx.inscripcionActividad.findUniqueOrThrow({ where });
              assert.equal(updated.id_estado_pago, targetStatus);
              assert.equal(updated.id_estado_inscripcion, isRefund ? closed.id_estado_inscripcion : active.id_estado_inscripcion);
              if (mode === 'movement') throw failure;
              return movementCreate.call(tx.movimientoContable, args);
            }) as typeof movementCreate;
            tx.auditoria.create = (async (args: Prisma.AuditoriaCreateArgs) => {
              auditCalls++;
              assert.equal(args.data.accion, isRefund ? 'INSCRIPCION_DEVUELTA' : 'INSCRIPCION_COBRADA');
              assert.equal(await tx.movimientoContable.count({ where }), priorMovements.length + 1);
              assert.deepEqual(await prisma.inscripcionActividad.findUniqueOrThrow({ where }), before);
              assert.equal(await prisma.movimientoContable.count({ where }), priorMovements.length);
              if (mode === 'audit-before') throw failure;
              const audit = await auditCreate.call(tx.auditoria, args);
              if (mode === 'audit-after') throw failure;
              if (mode === 'retry-exhausted' || (mode === 'retry' && attempts === 1)) {
                throw new Prisma.PrismaClientKnownRequestError('Conflicto simulado', { code: 'P2034', clientVersion: '7.10.0' });
              }
              return audit;
            }) as typeof auditCreate;
            try { return await operation(tx); }
            finally {
              tx.movimientoContable.create = movementCreate;
              tx.auditoria.create = auditCreate;
            }
          }, options)) as typeof prisma.$transaction;
          const logMock = subtest.mock.method(console, 'error', () => {});
          try {
            const result = await request('PUT', `/inscripciones/${where.id_inscripcion}`, 'Operador', isRefund ? { id_estado_pago: targetStatus } : payment);
            expectStatus(result, mode === 'retry' ? 200 : mode === 'retry-exhausted' ? 409 : 500);
            assert.equal(attempts, mode === 'retry' ? 2 : mode === 'retry-exhausted' ? 3 : 1);
            assert.equal(auditCalls, mode === 'movement' ? 0 : attempts);
            const movements = await prisma.movimientoContable.findMany({ where });
            const audits = await prisma.auditoria.findMany({ where: { requestId: result.requestId } });
            if (mode === 'retry') {
              assert.equal(movements.length, priorMovements.length + 1);
              const newMovement = movements.find(row => !priorMovements.some(old => old.id_movimiento === row.id_movimiento))!;
              assert(newMovement);
              assert.equal(audits.length, 1);
              assert.equal(audits[0]!.id_usuario, ids.Operador);
              assert.equal(audits[0]!.rol_actor, 'Operador');
              assert.equal(audits[0]!.id_recurso, where.id_inscripcion);
              assert.deepEqual(audits[0]!.detalles, { importe: isRefund ? '-25.00' : '25.00', id_movimiento: newMovement.id_movimiento });
              assert.equal((await prisma.inscripcionActividad.findUniqueOrThrow({ where })).id_estado_pago, targetStatus);
            } else {
              assert.deepEqual(await prisma.inscripcionActividad.findUniqueOrThrow({ where }), before);
              assert.deepEqual(movements, priorMovements);
              assert.equal(audits.length, 0);
            }
          } finally {
            prisma.$transaction = transactionMethod;
            logMock.mock.restore();
          }
        });
      }
    }
    for (const mode of ['pending', 'paid-first', 'paid-second', 'paid-after'] as const) {
      await t.test(`Auditoria de creacion: rollback completo ${mode}`, async (subtest) => {
        const activity = await prisma.actividad.create({ data: {
          titulo: `${marker}-${mode}`, id_estado_actividad: activityStatus.id_estado_actividad,
        } });
        activities.push(activity.id_actividad);
        const data = { ...payload(activity.id_actividad), ...(mode !== 'pending' && payment) };
        const failure = new Error('Fallo controlado de auditoria de inscripcion');
        const transactionMethod = prisma.$transaction;
        const originalTransaction = transactionMethod.bind(prisma);
        let calls = 0;
        let enrollmentId = 0;
        prisma.$transaction = (async (
          operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
        ) => originalTransaction(async (tx) => {
          const delegate = tx.auditoria;
          const createMethod = delegate.create;
          delegate.create = (async (args: Prisma.AuditoriaCreateArgs) => {
            calls++;
            const row = await tx.inscripcionActividad.findFirstOrThrow({ where: { id_actividad: activity.id_actividad } });
            enrollmentId = row.id_inscripcion;
            assert.equal(args.data.id_recurso, enrollmentId);
            assert.equal(await tx.movimientoContable.count({ where: { id_inscripcion: enrollmentId } }), mode === 'pending' ? 0 : 1);
            assert.equal(await prisma.inscripcionActividad.count({ where: { id_actividad: activity.id_actividad } }), 0);
            if (mode === 'pending' || mode === 'paid-first' || (mode === 'paid-second' && calls === 2)) throw failure;
            const audit = await createMethod.call(delegate, args);
            if (mode === 'paid-after' && calls === 2) throw failure;
            return audit;
          }) as typeof delegate.create;
          try { return await operation(tx); }
          finally { delegate.create = createMethod; }
        }, options)) as typeof prisma.$transaction;
        const logMock = subtest.mock.method(console, 'error', () => {});
        try {
          const result = await request('POST', '/inscripciones', 'Administrador', data);
          expectStatus(result, 500);
          assert.equal(calls, mode === 'pending' || mode === 'paid-first' ? 1 : 2);
          assert(enrollmentId > 0);
          assert(logMock.mock.calls.some(call => call.arguments.includes(failure)));
          assert.equal(await prisma.inscripcionActividad.count({ where: { id_actividad: activity.id_actividad } }), 0);
          assert.equal(await prisma.movimientoContable.count({ where: { id_inscripcion: enrollmentId } }), 0);
          assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
        } finally {
          prisma.$transaction = transactionMethod;
          logMock.mock.restore();
        }
      });
    }
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
      await tx.auditoria.deleteMany({ where: { requestId: { in: requestIds } } });
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
