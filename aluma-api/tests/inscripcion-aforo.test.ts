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
import { prepararEstadoEnEspera, retirarEstadoEnEsperaDeLaPrueba } from './estadoInscripcionPrueba.js';
import { firstWaitingEnrollmentForUpdate } from '../src/repositories/inscripcion-actividad/repository.js';

test('El alta respeta el aforo, la lista de espera y las inscripciones abiertas', async () => {
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
  const marker = `aforo-${randomUUID().slice(0, 8)}`;
  const users: number[] = [];
  const activities: number[] = [];
  const requestIds: string[] = [];
  let estadoEspera = { id: 0, propio: false };

  async function request(method: string, path: string, token: string, body?: unknown) {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const id = response.headers.get('x-request-id');
    assert(id);
    requestIds.push(id);
    const texto = await response.text();
    return { status: response.status, body: texto ? JSON.parse(texto) as Record<string, unknown> : null };
  }

  try {
    estadoEspera = await prepararEstadoEnEspera();
    const loginStatus = await prisma.estadoUsuario.findFirstOrThrow({ where: { permiteLogin: true } });
    const documentType = await prisma.tipoDocumentoIdentificacion.findFirstOrThrow();
    const activityStatus = await prisma.estadoActividad.findFirstOrThrow();
    const pending = await prisma.estadoPago.findUniqueOrThrow({ where: { nombre_estado: 'Pendiente' } });
    const paid = await prisma.estadoPago.findUniqueOrThrow({ where: { nombre_estado: 'Pagado' } });
    const cancelled = await prisma.estadoPago.findUniqueOrThrow({ where: { nombre_estado: 'Cancelado' } });
    const refunded = await prisma.estadoPago.findUniqueOrThrow({ where: { nombre_estado: 'Devolución' } });
    const active = await prisma.estadoInscripcion.findUniqueOrThrow({ where: { nombre: 'Activa' } });
    const waiting = await prisma.estadoInscripcion.findUniqueOrThrow({ where: { nombre: 'En espera' } });
    const closed = await prisma.estadoInscripcion.findUniqueOrThrow({ where: { nombre: 'Cerrada' } });
    const operatorRole = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: 'Operador' } });
    const password = randomUUID();
    const hash = await bcrypt.hash(password, 4);

    async function crearUsuario() {
      const email = `${marker}-${users.length}@aluma.test`;
      const user = await prisma.usuario.create({ data: {
        id_tipo_documento: documentType.id_tipo_documento,
        numeroDocumento: `${marker}-${users.length}`,
        nombre: 'Nombre aforo',
        email,
        id_rol: operatorRole.id_rol,
        socio: false,
        id_estado_usuario: loginStatus.id_estado_usuario,
        matriculaPagada: false,
      } });
      users.push(user.id_usuario);
      await prisma.cuentaAutenticacion.create({ data: {
        id_usuario: user.id_usuario, proveedor: 'Local', email, password_hash: hash,
      } });
      return user.id_usuario;
    }

    const operador = await crearUsuario();
    const login = await request('POST', '/auth/login', 'anon', {
      email: `${marker}-0@aluma.test`, password,
    });
    assert.equal(login.status, 200);
    const token = login.body?.token as string;

    async function crearActividad(aforo: number | null) {
      const activity = await prisma.actividad.create({ data: {
        titulo: `${marker}-${activities.length}`,
        id_estado_actividad: activityStatus.id_estado_actividad,
        importeSocio: new Prisma.Decimal('8.00'),
        importeNoSocio: new Prisma.Decimal('10.00'),
        ...(aforo !== null ? { aforo } : {}),
      } });
      activities.push(activity.id_actividad);
      return activity.id_actividad;
    }

    async function alta(userId: number, activityId: number, apuntadoFecha = '2026-10-14') {
      return request('POST', '/inscripciones', token, {
        id_usuario: userId,
        id_actividad: activityId,
        id_estado_pago: paid.id_estado_pago,
        precioAplicado: 1,
        fechaPago: '2026-10-14',
        apuntadoFecha,
      });
    }

    function estado(body: Record<string, unknown> | null) {
      return body?.id_estado_inscripcion;
    }

    const personas = [];
    for (let i = 0; i < 12; i += 1) personas.push(await crearUsuario());

    const ilimitada = await crearActividad(null);
    const primera = await alta(personas[0]!, ilimitada);
    const segunda = await alta(personas[1]!, ilimitada, '2020-01-01');
    assert.equal(primera.status, 201, JSON.stringify(primera.body));
    assert.equal(segunda.status, 201, JSON.stringify(segunda.body));
    assert.equal(estado(primera.body), active.id_estado_inscripcion);
    assert.equal(estado(segunda.body), active.id_estado_inscripcion);
    assert.equal(primera.body?.id_estado_pago, pending.id_estado_pago);
    assert.equal(new Prisma.Decimal(primera.body?.precioAplicado as string).toFixed(2), '10.00');
    assert.equal(await prisma.movimientoContable.count({
      where: { id_inscripcion: primera.body?.id_inscripcion as number },
    }), 0);

    const cupo = await crearActividad(2);
    const conPlaza = await alta(personas[2]!, cupo);
    const ultima = await alta(personas[3]!, cupo);
    const completa = await alta(personas[4]!, cupo);
    assert.equal(estado(conPlaza.body), active.id_estado_inscripcion);
    assert.equal(estado(ultima.body), active.id_estado_inscripcion);
    assert.equal(completa.status, 201, JSON.stringify(completa.body));
    assert.equal(estado(completa.body), waiting.id_estado_inscripcion);
    assert.equal(completa.body?.id_estado_pago, pending.id_estado_pago);
    assert.equal(await prisma.movimientoContable.count({
      where: { id_inscripcion: completa.body?.id_inscripcion as number },
    }), 0);

    await prisma.actividad.update({ where: { id_actividad: cupo }, data: { aforo: 3 } });
    const saltaCola = await alta(personas[5]!, cupo, '2019-01-01');
    assert.equal(saltaCola.status, 201, JSON.stringify(saltaCola.body));
    assert.equal(estado(saltaCola.body), waiting.id_estado_inscripcion);
    const cabeza = await prisma.$transaction((tx) => firstWaitingEnrollmentForUpdate(
      cupo, waiting.id_estado_inscripcion, tx,
    ));
    assert.equal(cabeza, completa.body?.id_inscripcion);

    const duplicaActiva = await alta(personas[2]!, cupo);
    assert.equal(duplicaActiva.status, 409);
    assert.equal(duplicaActiva.body?.code, 'ACTIVE_ENROLLMENT_ALREADY_EXISTS');
    const duplicaEspera = await alta(personas[4]!, cupo);
    assert.equal(duplicaEspera.status, 409);
    assert.equal(duplicaEspera.body?.code, 'ACTIVE_ENROLLMENT_ALREADY_EXISTS');

    await prisma.inscripcionActividad.update({
      where: { id_inscripcion: conPlaza.body?.id_inscripcion as number },
      data: { id_estado_inscripcion: closed.id_estado_inscripcion },
    });
    const trasCerrada = await alta(personas[2]!, cupo);
    assert.equal(trasCerrada.status, 201, JSON.stringify(trasCerrada.body));
    assert.equal(estado(trasCerrada.body), waiting.id_estado_inscripcion);

    const libre = await crearActividad(1);
    const cerrada = await alta(personas[6]!, libre);
    await prisma.inscripcionActividad.update({
      where: { id_inscripcion: cerrada.body?.id_inscripcion as number },
      data: { id_estado_inscripcion: closed.id_estado_inscripcion },
    });
    const otra = await alta(personas[6]!, libre);
    assert.equal(otra.status, 201, JSON.stringify(otra.body));
    assert.equal(estado(otra.body), active.id_estado_inscripcion);

    const cancelada = await crearActividad(1);
    const filaCancelada = await alta(personas[7]!, cancelada);
    await prisma.inscripcionActividad.update({
      where: { id_inscripcion: filaCancelada.body?.id_inscripcion as number },
      data: { id_estado_pago: cancelled.id_estado_pago },
    });
    const trasCancelar = await alta(personas[8]!, cancelada);
    assert.equal(estado(trasCancelar.body), active.id_estado_inscripcion);

    const devuelta = await crearActividad(1);
    const filaDevuelta = await alta(personas[9]!, devuelta);
    await prisma.inscripcionActividad.update({
      where: { id_inscripcion: filaDevuelta.body?.id_inscripcion as number },
      data: {
        id_estado_pago: refunded.id_estado_pago,
        id_estado_inscripcion: closed.id_estado_inscripcion,
      },
    });
    const trasDevolver = await alta(personas[10]!, devuelta);
    assert.equal(estado(trasDevolver.body), active.id_estado_inscripcion);

    const pagada = await crearActividad(1);
    const filaPagada = await alta(personas[11]!, pagada);
    await prisma.inscripcionActividad.update({
      where: { id_inscripcion: filaPagada.body?.id_inscripcion as number },
      data: { id_estado_pago: paid.id_estado_pago },
    });
    const trasPagar = await alta(operador, pagada);
    assert.equal(estado(trasPagar.body), waiting.id_estado_inscripcion);

    const carrera = await crearActividad(1);
    const simultaneas = await Promise.all([
      alta(personas[0]!, carrera),
      alta(personas[1]!, carrera),
    ]);
    const estadosCarrera = simultaneas.map((respuesta) => estado(respuesta.body)).sort();
    assert.deepEqual(simultaneas.map((respuesta) => respuesta.status), [201, 201]);
    assert.deepEqual(estadosCarrera, [active.id_estado_inscripcion, waiting.id_estado_inscripcion].sort());

    const repetida = await crearActividad(null);
    const repetidas = await Promise.all([
      alta(personas[3]!, repetida),
      alta(personas[3]!, repetida),
    ]);
    assert.deepEqual(repetidas.map((respuesta) => respuesta.status).sort(), [201, 409]);
    assert.equal(repetidas.find((respuesta) => respuesta.status === 409)?.body?.code, 'ACTIVE_ENROLLMENT_ALREADY_EXISTS');
  } finally {
    server.close();
    server.closeAllConnections();
    await once(server, 'close');
    await prisma.$transaction(async (tx) => {
      await tx.auditoria.deleteMany({ where: { requestId: { in: requestIds } } });
      const inscripciones = await tx.inscripcionActividad.findMany({
        where: { id_actividad: { in: activities } },
        select: { id_inscripcion: true },
      });
      const ids = inscripciones.map((row) => row.id_inscripcion);
      await tx.movimientoContable.deleteMany({ where: { id_inscripcion: { in: ids } } });
      await tx.inscripcionActividad.deleteMany({ where: { id_inscripcion: { in: ids } } });
      await tx.actividad.deleteMany({ where: { id_actividad: { in: activities } } });
      await tx.cuentaAutenticacion.deleteMany({ where: { id_usuario: { in: users } } });
      await tx.usuario.deleteMany({ where: { id_usuario: { in: users } } });
    });
    await retirarEstadoEnEsperaDeLaPrueba(estadoEspera);
    await prisma.$disconnect();
  }
});
