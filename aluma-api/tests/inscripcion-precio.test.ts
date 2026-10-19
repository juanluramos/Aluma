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
import { errorMiddleware } from '../src/middlewares/error.middleware.js';

test('El alta guarda la tarifa del usuario y no el precio del cliente', async () => {
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
  const marker = `precio-${randomUUID().slice(0, 8)}`;
  const users: number[] = [];
  const activities: number[] = [];
  const requestIds: string[] = [];

  async function request(method: string, path: string, token: string, body?: unknown) {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const id = response.headers.get('x-request-id');
    assert(id);
    requestIds.push(id);
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  }

  try {
    const loginStatus = await prisma.estadoUsuario.findFirstOrThrow({ where: { permiteLogin: true } });
    const documentType = await prisma.tipoDocumentoIdentificacion.findFirstOrThrow();
    const activityStatus = await prisma.estadoActividad.findFirstOrThrow();
    const method = await prisma.metodoPago.findFirstOrThrow();
    const pending = await prisma.estadoPago.findUniqueOrThrow({ where: { nombre_estado: 'Pendiente' } });
    const paid = await prisma.estadoPago.findUniqueOrThrow({ where: { nombre_estado: 'Pagado' } });
    const operatorRole = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: 'Operador' } });
    const password = randomUUID();
    const hash = await bcrypt.hash(password, 4);

    async function crearUsuario(socio: boolean) {
      const email = `${marker}-${socio ? 'socio' : 'nosocio'}-${users.length}@aluma.test`;
      const user = await prisma.usuario.create({ data: {
        id_tipo_documento: documentType.id_tipo_documento,
        numeroDocumento: `${marker}-${users.length}`,
        nombre: marker,
        email,
        id_rol: operatorRole.id_rol,
        socio,
        id_estado_usuario: loginStatus.id_estado_usuario,
        matriculaPagada: false,
      } });
      users.push(user.id_usuario);
      await prisma.cuentaAutenticacion.create({ data: {
        id_usuario: user.id_usuario, proveedor: 'local', email, password_hash: hash,
      } });
      return user.id_usuario;
    }

    const operador = await crearUsuario(false);
    const socio = await crearUsuario(true);
    const noSocio = await crearUsuario(false);
    const login = await request('POST', '/auth/login', 'anon', { email: `${marker}-nosocio-0@aluma.test`, password });
    assert.equal(login.status, 200);
    const token = login.body.token as string;

    async function crearActividad(importeSocio: Prisma.Decimal | null, importeNoSocio: Prisma.Decimal | null) {
      const activity = await prisma.actividad.create({ data: {
        titulo: `${marker}-${activities.length}`,
        id_estado_actividad: activityStatus.id_estado_actividad,
        importeSocio,
        importeNoSocio,
      } });
      activities.push(activity.id_actividad);
      return activity.id_actividad;
    }

    async function alta(userId: number, activityId: number, precioCliente: number) {
      return request('POST', '/inscripciones', token, {
        id_usuario: userId,
        id_actividad: activityId,
        id_estado_pago: paid.id_estado_pago,
        id_metodo_pago: method.id_metodo_pago,
        precioAplicado: precioCliente,
        fechaPago: '2026-10-14',
        apuntadoFecha: '2026-10-14',
      });
    }

    function precio(body: { precioAplicado: unknown }) {
      return new Prisma.Decimal(body.precioAplicado as string).toFixed(2);
    }

    const conTarifas = await crearActividad(new Prisma.Decimal('8.50'), new Prisma.Decimal('12.75'));
    const altaSocio = await alta(socio, conTarifas, 0.01);
    assert.equal(altaSocio.status, 201, JSON.stringify(altaSocio.body));
    assert.equal(precio(altaSocio.body), '8.50');
    assert.equal(altaSocio.body.id_estado_pago, pending.id_estado_pago);
    assert.equal(altaSocio.body.id_metodo_pago, null);
    assert.equal(await prisma.movimientoContable.count({ where: { id_inscripcion: altaSocio.body.id_inscripcion } }), 0);

    const altaNoSocio = await alta(noSocio, conTarifas, 1000);
    assert.equal(altaNoSocio.status, 201, JSON.stringify(altaNoSocio.body));
    assert.equal(precio(altaNoSocio.body), '12.75');
    assert.equal(await prisma.movimientoContable.count({ where: { id_inscripcion: altaNoSocio.body.id_inscripcion } }), 0);

    const gratuita = await crearActividad(new Prisma.Decimal(0), null);
    const altaGratis = await alta(socio, gratuita, 15);
    assert.equal(altaGratis.status, 201, JSON.stringify(altaGratis.body));
    assert.equal(precio(altaGratis.body), '0.00');

    const sinTarifaSocio = await crearActividad(null, new Prisma.Decimal('12.75'));
    const rechazadaSocio = await alta(socio, sinTarifaSocio, 0);
    assert.equal(rechazadaSocio.status, 400);
    assert.equal(rechazadaSocio.body.code, 'ENROLLMENT_PRICE_UNDEFINED');
    assert.equal(await prisma.inscripcionActividad.count({ where: { id_actividad: sinTarifaSocio } }), 0);

    const sinTarifaNoSocio = await crearActividad(new Prisma.Decimal('8.50'), null);
    const rechazadaNoSocio = await alta(noSocio, sinTarifaNoSocio, 0);
    assert.equal(rechazadaNoSocio.status, 400);
    assert.equal(rechazadaNoSocio.body.code, 'ENROLLMENT_PRICE_UNDEFINED');
    assert.equal(await prisma.inscripcionActividad.count({ where: { id_actividad: sinTarifaNoSocio } }), 0);

    await prisma.actividad.update({
      where: { id_actividad: conTarifas },
      data: { importeSocio: new Prisma.Decimal('50.00'), importeNoSocio: new Prisma.Decimal('60.00') },
    });
    await prisma.usuario.update({ where: { id_usuario: noSocio }, data: { socio: true } });
    await prisma.usuario.update({ where: { id_usuario: socio }, data: { socio: false } });

    const historicoSocio = await prisma.inscripcionActividad.findUniqueOrThrow({
      where: { id_inscripcion: altaSocio.body.id_inscripcion },
    });
    const historicoNoSocio = await prisma.inscripcionActividad.findUniqueOrThrow({
      where: { id_inscripcion: altaNoSocio.body.id_inscripcion },
    });
    assert.equal(historicoSocio.precioAplicado?.toFixed(2), '8.50');
    assert.equal(historicoNoSocio.precioAplicado?.toFixed(2), '12.75');

    const cobro = await request('PUT', `/inscripciones/${altaNoSocio.body.id_inscripcion}`, token, {
      id_estado_pago: paid.id_estado_pago,
      id_metodo_pago: method.id_metodo_pago,
      fechaPago: '2026-10-14',
    });
    assert.equal(cobro.status, 200, JSON.stringify(cobro.body));
    assert.equal(precio(cobro.body), '12.75');
    const movimientos = await prisma.movimientoContable.findMany({
      where: { id_inscripcion: altaNoSocio.body.id_inscripcion },
    });
    assert.equal(movimientos.length, 1);
    assert.equal(movimientos[0]!.importe.toFixed(2), '12.75');
    assert.equal(operador > 0, true);
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
