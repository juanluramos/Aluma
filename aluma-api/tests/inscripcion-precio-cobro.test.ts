import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/config/prisma.js';
import { requestId } from '../src/middlewares/request-id.middleware.js';
import authRoutes from '../src/routes/auth/routes.js';
import enrollmentRoutes from '../src/routes/inscripcion-actividad/routes.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';

test('El cobro usa el precio guardado y rechaza un precio enviado por el cliente', async () => {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/inscripciones', enrollmentRoutes);
  app.use(errorMiddleware);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api`;
  const marker = `cobro-${randomUUID().slice(0, 8)}`;
  const users: number[] = [];
  const activities: number[] = [];
  const requestIds: string[] = [];

  async function request(method: string, path: string, token?: string, body?: unknown) {
    const response = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const id = response.headers.get('x-request-id');
    assert(id);
    requestIds.push(id);
    return { status: response.status, body: response.status === 204 ? null : await response.json(), requestId: id };
  }

  try {
    const loginStatus = await prisma.estadoUsuario.findFirstOrThrow({ where: { permiteLogin: true } });
    const documentType = await prisma.tipoDocumentoIdentificacion.findFirstOrThrow();
    const activityStatus = await prisma.estadoActividad.findFirstOrThrow();
    const method = await prisma.metodoPago.findFirstOrThrow();
    const pending = await prisma.estadoPago.findUniqueOrThrow({ where: { nombre_estado: 'Pendiente' } });
    const paid = await prisma.estadoPago.findUniqueOrThrow({
      where: { nombre_estado: 'Pagado' }, include: { TipoMovimiento: true },
    });
    const refunded = await prisma.estadoPago.findUniqueOrThrow({
      where: { nombre_estado: 'Devolución' }, include: { TipoMovimiento: true },
    });
    const closed = await prisma.estadoInscripcion.findUniqueOrThrow({ where: { nombre: 'Cerrada' } });
    const operatorRole = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: 'Operador' } });
    const userRole = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: 'Usuario' } });
    const password = randomUUID();
    const hash = await bcrypt.hash(password, 4);
    assert(paid.TipoMovimiento && refunded.TipoMovimiento);

    async function crearUsuario(rol: number) {
      const email = `${marker}-${users.length}@aluma.test`;
      const user = await prisma.usuario.create({ data: {
        id_tipo_documento: documentType.id_tipo_documento,
        numeroDocumento: `${marker}-${users.length}`,
        nombre: marker,
        email,
        id_rol: rol,
        socio: false,
        id_estado_usuario: loginStatus.id_estado_usuario,
        matriculaPagada: false,
      } });
      users.push(user.id_usuario);
      await prisma.cuentaAutenticacion.create({ data: {
        id_usuario: user.id_usuario, proveedor: 'Local', email, password_hash: hash,
      } });
      const login = await request('POST', '/auth/login', undefined, { email, password });
      assert.equal(login.status, 200);
      return { id: user.id_usuario, token: login.body.token as string };
    }

    const operador = await crearUsuario(operatorRole.id_rol);
    const usuario = await crearUsuario(userRole.id_rol);
    const activity = await prisma.actividad.create({ data: {
      titulo: marker,
      id_estado_actividad: activityStatus.id_estado_actividad,
      importeSocio: 10,
      importeNoSocio: 25,
    } });
    activities.push(activity.id_actividad);
    const alta = await request('POST', '/inscripciones', operador.token, {
      id_usuario: operador.id,
      id_actividad: activity.id_actividad,
      id_estado_pago: pending.id_estado_pago,
      apuntadoFecha: '2026-10-01',
    });
    assert.equal(alta.status, 201, JSON.stringify(alta.body));
    const id = alta.body.id_inscripcion as number;
    const cobro = {
      id_estado_pago: paid.id_estado_pago,
      id_metodo_pago: method.id_metodo_pago,
      fechaPago: '2026-10-14',
    };

    async function ficha() {
      const row = await prisma.inscripcionActividad.findUniqueOrThrow({ where: { id_inscripcion: id } });
      const movimientos = await prisma.movimientoContable.findMany({
        where: { id_inscripcion: id },
        orderBy: { id_movimiento: 'asc' },
      });
      return {
        precio: row.precioAplicado?.toFixed(2) ?? null,
        pago: row.id_estado_pago,
        estado: row.id_estado_inscripcion,
        movimientos: movimientos.map((movimiento) => movimiento.importe.toFixed(2)),
      };
    }

    const directo = await request('PUT', `/inscripciones/${id}`, operador.token, { precioAplicado: 10 });
    assert.equal(directo.status, 400);
    assert.equal(directo.body.code, 'ENROLLMENT_PRICE_LOCKED');
    assert.equal(await prisma.auditoria.count({ where: { requestId: directo.requestId } }), 0);
    assert.deepEqual(await ficha(), { precio: '25.00', pago: pending.id_estado_pago, estado: alta.body.id_estado_inscripcion, movimientos: [] });

    const manipulado = await request('PUT', `/inscripciones/${id}`, operador.token, { ...cobro, precioAplicado: 0.01 });
    assert.equal(manipulado.status, 400);
    assert.equal(manipulado.body.code, 'ENROLLMENT_PRICE_LOCKED');
    assert.equal(await prisma.auditoria.count({ where: { requestId: manipulado.requestId } }), 0);
    assert.deepEqual(await ficha(), { precio: '25.00', pago: pending.id_estado_pago, estado: alta.body.id_estado_inscripcion, movimientos: [] });

    const denegado = await request('PUT', `/inscripciones/${id}`, usuario.token, cobro);
    assert.equal(denegado.status, 403);
    assert.equal(await prisma.auditoria.count({ where: { requestId: denegado.requestId } }), 0);

    const cobrado = await request('PUT', `/inscripciones/${id}`, operador.token, cobro);
    assert.equal(cobrado.status, 200, JSON.stringify(cobrado.body));
    assert.equal(Number(cobrado.body.precioAplicado).toFixed(2), '25.00');
    assert.deepEqual(await ficha(), {
      precio: '25.00',
      pago: paid.id_estado_pago,
      estado: alta.body.id_estado_inscripcion,
      movimientos: ['25.00'],
    });
    const auditoriaCobro = await prisma.auditoria.findMany({ where: { requestId: cobrado.requestId } });
    assert.equal(auditoriaCobro.length, 1);
    assert.equal(auditoriaCobro[0]!.accion, 'INSCRIPCION_COBRADA');
    assert.equal(auditoriaCobro[0]!.id_usuario, operador.id);
    assert.equal(auditoriaCobro[0]!.rol_actor, 'Operador');
    assert.equal((auditoriaCobro[0]!.detalles as { importe: string }).importe, '25.00');

    const pagada = await request('PUT', `/inscripciones/${id}`, operador.token, { precioAplicado: 0.01 });
    assert.equal(pagada.status, 409);
    assert.equal(pagada.body.code, 'ENROLLMENT_ACCOUNTING_LOCKED');
    assert.equal((await ficha()).precio, '25.00');
    assert.deepEqual((await ficha()).movimientos, ['25.00']);

    const devolucionManipulada = await request('PUT', `/inscripciones/${id}`, operador.token, {
      id_estado_pago: refunded.id_estado_pago,
      precioAplicado: 0.01,
    });
    assert.equal(devolucionManipulada.status, 409);
    assert.equal(devolucionManipulada.body.code, 'ENROLLMENT_ACCOUNTING_LOCKED');
    assert.equal(await prisma.auditoria.count({ where: { requestId: devolucionManipulada.requestId } }), 0);
    assert.deepEqual(await ficha(), {
      precio: '25.00',
      pago: paid.id_estado_pago,
      estado: alta.body.id_estado_inscripcion,
      movimientos: ['25.00'],
    });

    const devuelta = await request('PUT', `/inscripciones/${id}`, operador.token, {
      id_estado_pago: refunded.id_estado_pago,
    });
    assert.equal(devuelta.status, 200, JSON.stringify(devuelta.body));
    assert.equal(devuelta.body.id_estado_inscripcion, closed.id_estado_inscripcion);
    assert.deepEqual(await ficha(), {
      precio: '25.00',
      pago: refunded.id_estado_pago,
      estado: closed.id_estado_inscripcion,
      movimientos: ['25.00', '-25.00'],
    });
    const auditoriaDevolucion = await prisma.auditoria.findMany({ where: { requestId: devuelta.requestId } });
    assert.equal(auditoriaDevolucion.length, 1);
    assert.equal(auditoriaDevolucion[0]!.accion, 'INSCRIPCION_DEVUELTA');
    assert.equal((auditoriaDevolucion[0]!.detalles as { importe: string }).importe, '-25.00');
  } finally {
    server.close();
    server.closeAllConnections();
    await once(server, 'close');
    await prisma.$transaction(async (tx) => {
      await tx.auditoria.deleteMany({ where: { requestId: { in: requestIds } } });
      const inscripciones = await tx.inscripcionActividad.findMany({
        where: { id_actividad: { in: activities }, id_usuario: { in: users } },
        select: { id_inscripcion: true },
      });
      const ids = inscripciones.map((row) => row.id_inscripcion);
      await tx.movimientoContable.deleteMany({ where: { id_inscripcion: { in: ids } } });
      await tx.inscripcionActividad.deleteMany({ where: { id_inscripcion: { in: ids } } });
      await tx.actividad.deleteMany({ where: { id_actividad: { in: activities } } });
      await tx.cuentaAutenticacion.deleteMany({ where: { id_usuario: { in: users } } });
      await tx.usuario.deleteMany({ where: { id_usuario: { in: users } } });
    });
    await prisma.$disconnect();
  }
});
