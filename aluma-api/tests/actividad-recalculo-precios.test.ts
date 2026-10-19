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
import activityRoutes from '../src/routes/actividad/routes.js';
import enrollmentRoutes from '../src/routes/inscripcion-actividad/routes.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';

test('Un cambio de tarifa recalcula solo las inscripciones activas pendientes', async () => {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/actividades', activityRoutes);
  app.use('/api/inscripciones', enrollmentRoutes);
  app.use(errorMiddleware);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api`;
  const marker = `tarifa-${randomUUID().slice(0, 8)}`;
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

  async function precio(id: number) {
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
    const password = randomUUID();
    const hash = await bcrypt.hash(password, 4);
    assert(paid.TipoMovimiento && refunded.TipoMovimiento);

    async function crearUsuario(socio: boolean, rol = operatorRole.id_rol) {
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

    const operador = await crearUsuario(false);
    const socio = await crearUsuario(true);
    const noSocio = await crearUsuario(false);
    const login = await request('POST', '/auth/login', undefined, { email: operador.email, password });
    assert.equal(login.status, 200);
    const token = login.body.token as string;

    async function crearActividad() {
      const activity = await prisma.actividad.create({ data: {
        titulo: `${marker}-${activities.length}`,
        id_estado_actividad: activityStatus.id_estado_actividad,
        importeSocio: new Prisma.Decimal('15.00'),
        importeNoSocio: new Prisma.Decimal('30.00'),
      } });
      activities.push(activity.id_actividad);
      return activity.id_actividad;
    }

    async function crearInscripcion(
      userId: number,
      activityId: number,
      pago: number,
      estado: number,
      extras: { metodo?: number; fechaPago?: Date } = {},
    ) {
      const row = await prisma.inscripcionActividad.create({ data: {
        id_usuario: userId,
        id_actividad: activityId,
        precioAplicado: new Prisma.Decimal('15.00'),
        id_estado_pago: pago,
        id_estado_inscripcion: estado,
        apuntadoFecha: new Date('2026-10-01'),
        ...(extras.metodo !== undefined && { id_metodo_pago: extras.metodo }),
        ...(extras.fechaPago !== undefined && { fechaPago: extras.fechaPago }),
      } });
      enrollments.push(row.id_inscripcion);
      return row.id_inscripcion;
    }

    const actividad = await crearActividad();
    const otra = await crearActividad();
    const pendienteSocio = await crearInscripcion(socio.id_usuario, actividad, pending.id_estado_pago, active.id_estado_inscripcion);
    const pendienteNoSocio = await crearInscripcion(noSocio.id_usuario, actividad, pending.id_estado_pago, active.id_estado_inscripcion);
    await prisma.inscripcionActividad.update({
      where: { id_inscripcion: pendienteNoSocio },
      data: { precioAplicado: new Prisma.Decimal('30.00') },
    });
    const pagada = await crearInscripcion(socio.id_usuario, actividad, paid.id_estado_pago, active.id_estado_inscripcion, {
      metodo: method.id_metodo_pago, fechaPago: new Date('2026-10-02'),
    });
    const cerrada = await crearInscripcion(socio.id_usuario, actividad, pending.id_estado_pago, closed.id_estado_inscripcion);
    const devuelta = await crearInscripcion(socio.id_usuario, actividad, refunded.id_estado_pago, closed.id_estado_inscripcion, {
      metodo: method.id_metodo_pago, fechaPago: new Date('2026-10-02'),
    });
    const cancelada = await crearInscripcion(socio.id_usuario, actividad, cancelled.id_estado_pago, active.id_estado_inscripcion);
    const ajena = await crearInscripcion(socio.id_usuario, otra, pending.id_estado_pago, active.id_estado_inscripcion);
    await prisma.movimientoContable.create({ data: {
      id_tipo_movimiento: paid.TipoMovimiento.id_tipo_movimiento,
      concepto: 'Cobro inscripción', importe: new Prisma.Decimal('15.00'),
      fecha: new Date('2026-10-02'), id_inscripcion: pagada,
    } });
    await prisma.movimientoContable.create({ data: {
      id_tipo_movimiento: paid.TipoMovimiento.id_tipo_movimiento,
      concepto: 'Cobro inscripción', importe: new Prisma.Decimal('15.00'),
      fecha: new Date('2026-10-02'), id_inscripcion: devuelta,
    } });
    await prisma.movimientoContable.create({ data: {
      id_tipo_movimiento: refunded.TipoMovimiento.id_tipo_movimiento,
      concepto: 'Devolución inscripción', importe: new Prisma.Decimal('-15.00'),
      fecha: new Date('2026-10-03'), id_inscripcion: devuelta,
    } });
    const historial = await movimientos();
    const protegidas = await Promise.all([pagada, cerrada, devuelta, cancelada].map(precio));

    const subida = await request('PUT', `/actividades/${actividad}`, token, { importeSocio: 20 });
    assert.equal(subida.status, 200, JSON.stringify(subida.body));
    assert.equal(new Prisma.Decimal(subida.body.importeSocio).toFixed(2), '20.00');
    assert.equal((await precio(pendienteSocio)).precio, '20.00');
    assert.equal((await precio(pendienteNoSocio)).precio, '30.00');
    assert.deepEqual(await Promise.all([pagada, cerrada, devuelta, cancelada].map(precio)), protegidas);
    assert.equal((await precio(ajena)).precio, '15.00');
    assert.deepEqual(await movimientos(), historial);
    const consulta = await request('GET', `/inscripciones/${pendienteSocio}`, token);
    assert.equal(consulta.status, 200);
    assert.equal(new Prisma.Decimal(consulta.body.precioAplicado).toFixed(2), '20.00');

    const noSocioNuevo = await request('PUT', `/actividades/${actividad}`, token, { importeNoSocio: 22 });
    assert.equal(noSocioNuevo.status, 200, JSON.stringify(noSocioNuevo.body));
    assert.equal((await precio(pendienteNoSocio)).precio, '22.00');
    assert.equal((await precio(pendienteSocio)).precio, '20.00');
    assert.deepEqual(await Promise.all([pagada, cerrada, devuelta, cancelada].map(precio)), protegidas);
    assert.deepEqual(await movimientos(), historial);

    await prisma.usuario.update({ where: { id_usuario: socio.id_usuario }, data: { socio: false } });
    const segunSocioActual = await request('PUT', `/actividades/${actividad}`, token, { importeNoSocio: 28 });
    assert.equal(segunSocioActual.status, 200, JSON.stringify(segunSocioActual.body));
    assert.equal((await precio(pendienteSocio)).precio, '28.00');
    assert.equal((await precio(pendienteNoSocio)).precio, '28.00');
    assert.equal((await precio(pagada)).precio, '15.00');
    await prisma.usuario.update({ where: { id_usuario: socio.id_usuario }, data: { socio: true } });

    const gratuita = await request('PUT', `/actividades/${actividad}`, token, { importeSocio: 0 });
    assert.equal(gratuita.status, 200, JSON.stringify(gratuita.body));
    assert.equal((await precio(pendienteSocio)).precio, '0.00');
    assert.equal((await precio(pendienteNoSocio)).precio, '28.00');
    assert.equal((await precio(pagada)).precio, '15.00');
    assert.deepEqual(await movimientos(), historial);

    const antesDeNulo = await prisma.actividad.findUniqueOrThrow({ where: { id_actividad: actividad } });
    const rechazada = await request('PUT', `/actividades/${actividad}`, token, { importeSocio: null });
    assert.equal(rechazada.status, 400);
    assert.equal(rechazada.body.code, 'ENROLLMENT_PRICE_UNDEFINED');
    const trasRechazo = await prisma.actividad.findUniqueOrThrow({ where: { id_actividad: actividad } });
    assert.equal(trasRechazo.importeSocio?.toFixed(2), antesDeNulo.importeSocio?.toFixed(2));
    assert.equal(trasRechazo.importeNoSocio?.toFixed(2), '28.00');
    assert.equal((await precio(pendienteSocio)).precio, '0.00');
    assert.equal((await precio(pendienteNoSocio)).precio, '28.00');
    assert.equal((await precio(pagada)).precio, '15.00');
    assert.deepEqual(await movimientos(), historial);
    assert.equal(await prisma.auditoria.count({ where: { requestId: rechazada.requestId } }), 0);

    const soloTitulo = await request('PUT', `/actividades/${actividad}`, token, { titulo: `${marker}-titulo` });
    assert.equal(soloTitulo.status, 200);
    assert.equal((await precio(pendienteSocio)).precio, '0.00');
    assert.equal((await precio(pendienteNoSocio)).precio, '28.00');
    assert.equal((await precio(pagada)).precio, '15.00');
    assert.equal((await precio(ajena)).precio, '15.00');
    assert.deepEqual(await movimientos(), historial);

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
        assert.equal((await tx.actividad.findUniqueOrThrow({ where: { id_actividad: actividad } })).importeSocio?.toFixed(2), '40.00');
        assert.equal((await tx.inscripcionActividad.findUniqueOrThrow({ where: { id_inscripcion: pendienteSocio } })).precioAplicado?.toFixed(2), '40.00');
        assert.equal((await prisma.actividad.findUniqueOrThrow({ where: { id_actividad: actividad } })).importeSocio?.toFixed(2), '0.00');
        assert.equal((await prisma.inscripcionActividad.findUniqueOrThrow({ where: { id_inscripcion: pendienteSocio } })).precioAplicado?.toFixed(2), '0.00');
        throw failure;
      }) as typeof delegate.create;
      try { return await operation(tx); }
      finally { delegate.create = createMethod; }
    }, options)) as typeof prisma.$transaction;
    try {
      const rollback = await request('PUT', `/actividades/${actividad}`, token, { importeSocio: 40 });
      assert.equal(rollback.status, 500);
      assert.equal((await prisma.actividad.findUniqueOrThrow({ where: { id_actividad: actividad } })).importeSocio?.toFixed(2), '0.00');
      assert.equal((await precio(pendienteSocio)).precio, '0.00');
      assert.equal((await precio(pendienteNoSocio)).precio, '28.00');
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
