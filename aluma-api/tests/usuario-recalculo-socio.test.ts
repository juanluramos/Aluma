import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/config/prisma.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { initSocket } from '../src/socket/socket.js';
import { requestId } from '../src/middlewares/request-id.middleware.js';
import authRoutes from '../src/routes/auth/routes.js';
import userRoutes from '../src/routes/usuario/routes.js';
import enrollmentRoutes from '../src/routes/inscripcion-actividad/routes.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';

test('Cambiar la condición de socio recalcula solo las inscripciones activas pendientes de ese usuario', async () => {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/usuarios', userRoutes);
  app.use('/api/inscripciones', enrollmentRoutes);
  app.use(errorMiddleware);
  const server = app.listen(0, '127.0.0.1');
  initSocket(server);
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api`;
  const marker = `socio-${randomUUID().slice(0, 8)}`;
  const users: number[] = [];
  const activities: number[] = [];
  const enrollments: number[] = [];
  const requestIds: string[] = [];

  async function request(method: string, path: string, token: string | undefined, body?: unknown) {
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

  async function ficha(id: number) {
    const row = await prisma.inscripcionActividad.findUniqueOrThrow({ where: { id_inscripcion: id } });
    return {
      precio: row.precioAplicado?.toFixed(2) ?? null,
      pago: row.id_estado_pago,
      estado: row.id_estado_inscripcion,
      metodo: row.id_metodo_pago,
      fechaPago: row.fechaPago?.toISOString() ?? null,
    };
  }

  async function movimientos() {
    const rows = await prisma.movimientoContable.findMany({
      where: { id_inscripcion: { in: enrollments } },
      orderBy: { id_movimiento: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id_movimiento,
      inscripcion: row.id_inscripcion,
      importe: row.importe.toFixed(2),
      concepto: row.concepto,
    }));
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
    const cancelled = await prisma.estadoPago.findUniqueOrThrow({ where: { nombre_estado: 'Cancelado' } });
    const active = await prisma.estadoInscripcion.findUniqueOrThrow({ where: { nombre: 'Activa' } });
    const closed = await prisma.estadoInscripcion.findUniqueOrThrow({ where: { nombre: 'Cerrada' } });
    const operatorRole = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: 'Operador' } });
    const userRole = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: 'Usuario' } });
    const password = randomUUID();
    const hash = await bcrypt.hash(password, 4);
    assert(paid.TipoMovimiento && refunded.TipoMovimiento);

    async function crearUsuario(socio: boolean, rol: number) {
      const email = `${marker}-${users.length}@aluma.test`;
      const user = await prisma.usuario.create({ data: {
        id_tipo_documento: documentType.id_tipo_documento,
        numeroDocumento: `${marker}-${users.length}`,
        nombre: marker,
        email,
        id_rol: rol,
        socio,
        id_estado_usuario: loginStatus.id_estado_usuario,
        matriculaPagada: false,
      } });
      users.push(user.id_usuario);
      await prisma.cuentaAutenticacion.create({ data: {
        id_usuario: user.id_usuario, proveedor: 'Local', email, password_hash: hash,
      } });
      return user;
    }

    async function crearActividad(importeSocio: string | null, importeNoSocio: string | null) {
      const activity = await prisma.actividad.create({ data: {
        titulo: `${marker}-${activities.length}`,
        id_estado_actividad: activityStatus.id_estado_actividad,
        importeSocio: importeSocio === null ? null : new Prisma.Decimal(importeSocio),
        importeNoSocio: importeNoSocio === null ? null : new Prisma.Decimal(importeNoSocio),
      } });
      activities.push(activity.id_actividad);
      return activity.id_actividad;
    }

    async function crearInscripcion(
      userId: number,
      activityId: number,
      pago: number,
      estado: number,
      precio: string,
      extras: { metodo?: number; fechaPago?: Date } = {},
    ) {
      const row = await prisma.inscripcionActividad.create({ data: {
        id_usuario: userId,
        id_actividad: activityId,
        precioAplicado: new Prisma.Decimal(precio),
        id_estado_pago: pago,
        id_estado_inscripcion: estado,
        apuntadoFecha: new Date('2026-10-01'),
        ...(extras.metodo !== undefined && { id_metodo_pago: extras.metodo }),
        ...(extras.fechaPago !== undefined && { fechaPago: extras.fechaPago }),
      } });
      enrollments.push(row.id_inscripcion);
      return row.id_inscripcion;
    }

    const operador = await crearUsuario(false, operatorRole.id_rol);
    const afectado = await crearUsuario(true, userRole.id_rol);
    const ajeno = await crearUsuario(false, userRole.id_rol);
    const login = await request('POST', '/auth/login', undefined, { email: operador.email, password });
    assert.equal(login.status, 200);
    const token = login.body.token as string;

    const normal = await crearActividad('10.00', '25.00');
    const gratis = await crearActividad('0.00', '40.00');
    const protegida = await crearActividad('10.00', '99.00');
    const pendiente = await crearInscripcion(afectado.id_usuario, normal, pending.id_estado_pago, active.id_estado_inscripcion, '10.00');
    const gratuita = await crearInscripcion(afectado.id_usuario, gratis, pending.id_estado_pago, active.id_estado_inscripcion, '0.00');
    const pagada = await crearInscripcion(afectado.id_usuario, protegida, paid.id_estado_pago, active.id_estado_inscripcion, '10.00', {
      metodo: method.id_metodo_pago, fechaPago: new Date('2026-10-02'),
    });
    const cerrada = await crearInscripcion(afectado.id_usuario, protegida, pending.id_estado_pago, closed.id_estado_inscripcion, '10.00');
    const devuelta = await crearInscripcion(afectado.id_usuario, protegida, refunded.id_estado_pago, closed.id_estado_inscripcion, '10.00', {
      metodo: method.id_metodo_pago, fechaPago: new Date('2026-10-02'),
    });
    const cancelada = await crearInscripcion(afectado.id_usuario, protegida, cancelled.id_estado_pago, active.id_estado_inscripcion, '10.00');
    const deOtro = await crearInscripcion(ajeno.id_usuario, normal, pending.id_estado_pago, active.id_estado_inscripcion, '7.00');
    const cobro = { metodo: method.id_metodo_pago, fecha: new Date('2026-10-02') };
    await prisma.movimientoContable.create({ data: {
      id_tipo_movimiento: paid.TipoMovimiento.id_tipo_movimiento,
      concepto: 'Cobro inscripción', importe: new Prisma.Decimal('10.00'),
      fecha: cobro.fecha, id_inscripcion: pagada,
    } });
    await prisma.movimientoContable.create({ data: {
      id_tipo_movimiento: paid.TipoMovimiento.id_tipo_movimiento,
      concepto: 'Cobro inscripción', importe: new Prisma.Decimal('10.00'),
      fecha: cobro.fecha, id_inscripcion: devuelta,
    } });
    await prisma.movimientoContable.create({ data: {
      id_tipo_movimiento: refunded.TipoMovimiento.id_tipo_movimiento,
      concepto: 'Devolución inscripción', importe: new Prisma.Decimal('-10.00'),
      fecha: new Date('2026-10-03'), id_inscripcion: devuelta,
    } });
    const historial = await movimientos();
    const protegidas = await Promise.all([pagada, cerrada, devuelta, cancelada].map(ficha));

    async function auditorias(id: string) {
      return prisma.auditoria.findMany({ where: { requestId: id }, orderBy: { id_auditoria: 'asc' } });
    }

    const aNoSocio = await request('PUT', `/usuarios/${afectado.id_usuario}`, token, { socio: false });
    assert.equal(aNoSocio.status, 200, JSON.stringify(aNoSocio.body));
    assert.equal(aNoSocio.body.socio, false);
    assert.equal((await ficha(pendiente)).precio, '25.00');
    assert.equal((await ficha(gratuita)).precio, '40.00');
    assert.deepEqual(await Promise.all([pagada, cerrada, devuelta, cancelada].map(ficha)), protegidas);
    assert.equal((await ficha(deOtro)).precio, '7.00');
    assert.deepEqual(await movimientos(), historial);
    const consulta = await request('GET', `/inscripciones/${pendiente}`, token);
    assert.equal(consulta.status, 200);
    assert.equal(new Prisma.Decimal(consulta.body.precioAplicado).toFixed(2), '25.00');
    const auditsBaja = await auditorias(aNoSocio.requestId);
    const usuarioBaja = auditsBaja.filter((audit) => audit.accion === 'USUARIO_MODIFICADO');
    const preciosBaja = auditsBaja.filter((audit) => audit.accion === 'INSCRIPCION_MODIFICADA');
    assert.equal(usuarioBaja.length, 1);
    assert.equal(preciosBaja.length, 2);
    assert.deepEqual(usuarioBaja[0]!.detalles, { cambios: { socio: { anterior: true, nuevo: false } } });
    const preciosPorInscripcion = Object.fromEntries(preciosBaja.map((audit) => {
      const detalles = audit.detalles as { cambios: { precioAplicado: { anterior: string; nuevo: string } } };
      return [audit.id_recurso, detalles.cambios.precioAplicado];
    }));
    assert.deepEqual(preciosPorInscripcion[pendiente], { anterior: '10.00', nuevo: '25.00' });
    assert.deepEqual(preciosPorInscripcion[gratuita], { anterior: '0.00', nuevo: '40.00' });
    assert.equal(auditsBaja.every((audit) => audit.resultado === 'REALIZADA' && audit.id_usuario === operador.id_usuario), true);

    const aSocio = await request('PUT', `/usuarios/${afectado.id_usuario}`, token, { socio: true });
    assert.equal(aSocio.status, 200, JSON.stringify(aSocio.body));
    assert.equal(aSocio.body.socio, true);
    assert.equal((await ficha(pendiente)).precio, '10.00');
    assert.equal((await ficha(gratuita)).precio, '0.00');
    assert.deepEqual(await Promise.all([pagada, cerrada, devuelta, cancelada].map(ficha)), protegidas);
    assert.equal((await ficha(deOtro)).precio, '7.00');
    assert.deepEqual(await movimientos(), historial);
    const auditsAlta = await auditorias(aSocio.requestId);
    const preciosAlta = Object.fromEntries(auditsAlta.filter((audit) => audit.accion === 'INSCRIPCION_MODIFICADA').map((audit) => {
      const detalles = audit.detalles as { cambios: { precioAplicado: { anterior: string; nuevo: string } } };
      return [audit.id_recurso, detalles.cambios.precioAplicado];
    }));
    assert.deepEqual(preciosAlta[pendiente], { anterior: '25.00', nuevo: '10.00' });
    assert.deepEqual(preciosAlta[gratuita], { anterior: '40.00', nuevo: '0.00' });

    const sinTarifa = await crearActividad('10.00', null);
    const bloqueada = await crearInscripcion(afectado.id_usuario, sinTarifa, pending.id_estado_pago, active.id_estado_inscripcion, '10.00');
    const rechazada = await request('PUT', `/usuarios/${afectado.id_usuario}`, token, { socio: false });
    assert.equal(rechazada.status, 400);
    assert.equal(rechazada.body.code, 'ENROLLMENT_PRICE_UNDEFINED');
    assert.equal((await prisma.usuario.findUniqueOrThrow({ where: { id_usuario: afectado.id_usuario } })).socio, true);
    assert.equal((await ficha(pendiente)).precio, '10.00');
    assert.equal((await ficha(gratuita)).precio, '0.00');
    assert.equal((await ficha(bloqueada)).precio, '10.00');
    assert.deepEqual(await Promise.all([pagada, cerrada, devuelta, cancelada].map(ficha)), protegidas);
    assert.equal((await ficha(deOtro)).precio, '7.00');
    assert.deepEqual(await movimientos(), historial);
    assert.equal(await prisma.auditoria.count({ where: { requestId: rechazada.requestId } }), 0);
    await prisma.inscripcionActividad.delete({ where: { id_inscripcion: bloqueada } });
    enrollments.splice(enrollments.indexOf(bloqueada), 1);

    const soloNombre = await request('PUT', `/usuarios/${afectado.id_usuario}`, token, { nombre: 'Nombre revisado' });
    assert.equal(soloNombre.status, 200, JSON.stringify(soloNombre.body));
    assert.equal((await prisma.usuario.findUniqueOrThrow({ where: { id_usuario: afectado.id_usuario } })).socio, true);
    assert.equal((await ficha(pendiente)).precio, '10.00');
    assert.equal((await ficha(gratuita)).precio, '0.00');
    assert.equal((await ficha(deOtro)).precio, '7.00');
    assert.deepEqual(await movimientos(), historial);
    const auditsNombre = await auditorias(soloNombre.requestId);
    assert.equal(auditsNombre.length, 1);
    assert.equal(auditsNombre[0]!.accion, 'USUARIO_MODIFICADO');

    const mismoSocio = await request('PUT', `/usuarios/${afectado.id_usuario}`, token, { socio: true });
    assert.equal(mismoSocio.status, 200, JSON.stringify(mismoSocio.body));
    assert.equal((await ficha(pendiente)).precio, '10.00');
    assert.equal((await ficha(gratuita)).precio, '0.00');
    assert.equal(await prisma.auditoria.count({ where: { requestId: mismoSocio.requestId } }), 0);

    const failure = new Error('Fallo controlado de recálculo');
    const transactionMethod = prisma.$transaction;
    const originalTransaction = transactionMethod.bind(prisma);
    prisma.$transaction = (async (
      operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
      options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
    ) => originalTransaction(async (tx) => {
      const delegate = tx.auditoria;
      const createMethod = delegate.create;
      delegate.create = (async () => {
        assert.equal((await tx.usuario.findUniqueOrThrow({ where: { id_usuario: afectado.id_usuario } })).socio, false);
        assert.equal((await tx.inscripcionActividad.findUniqueOrThrow({ where: { id_inscripcion: pendiente } })).precioAplicado?.toFixed(2), '25.00');
        assert.equal((await prisma.usuario.findUniqueOrThrow({ where: { id_usuario: afectado.id_usuario } })).socio, true);
        assert.equal((await prisma.inscripcionActividad.findUniqueOrThrow({ where: { id_inscripcion: pendiente } })).precioAplicado?.toFixed(2), '10.00');
        throw failure;
      }) as typeof delegate.create;
      try { return await operation(tx); }
      finally { delegate.create = createMethod; }
    }, options)) as typeof prisma.$transaction;
    try {
      const rollback = await request('PUT', `/usuarios/${afectado.id_usuario}`, token, { socio: false });
      assert.equal(rollback.status, 500);
      assert.equal((await prisma.usuario.findUniqueOrThrow({ where: { id_usuario: afectado.id_usuario } })).socio, true);
      assert.equal((await ficha(pendiente)).precio, '10.00');
      assert.equal((await ficha(gratuita)).precio, '0.00');
      assert.equal((await ficha(deOtro)).precio, '7.00');
      assert.deepEqual(await Promise.all([pagada, cerrada, devuelta, cancelada].map(ficha)), protegidas);
      assert.deepEqual(await movimientos(), historial);
      assert.equal(await prisma.auditoria.count({ where: { requestId: rollback.requestId } }), 0);
    } finally {
      prisma.$transaction = transactionMethod;
    }
  } finally {
    server.close();
    server.closeAllConnections();
    await once(server, 'close');
    await prisma.$transaction(async (tx) => {
      await tx.auditoria.deleteMany({ where: { requestId: { in: requestIds } } });
      await tx.movimientoContable.deleteMany({ where: { id_inscripcion: { in: enrollments } } });
      await tx.inscripcionActividad.deleteMany({ where: { id_inscripcion: { in: enrollments } } });
      await tx.actividad.deleteMany({ where: { id_actividad: { in: activities } } });
      await tx.cuentaAutenticacion.deleteMany({ where: { id_usuario: { in: users } } });
      await tx.usuario.deleteMany({ where: { id_usuario: { in: users } } });
    });
    await prisma.$disconnect();
  }
});
