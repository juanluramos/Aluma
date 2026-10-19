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

test('El listado informa la lista de espera sin datos de otras personas', async () => {
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
  const marker = `dispo-${randomUUID().slice(0, 8)}`;
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
    const active = await prisma.estadoInscripcion.findUniqueOrThrow({ where: { nombre: 'Activa' } });
    const waiting = await prisma.estadoInscripcion.findUniqueOrThrow({ where: { nombre: 'En espera' } });
    const operatorRole = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: 'Operador' } });
    const userRole = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: 'Usuario' } });
    const password = randomUUID();
    const hash = await bcrypt.hash(password, 4);

    async function crearUsuario(rolId: number, nombre: string) {
      const email = `${marker}-${users.length}@aluma.test`;
      const user = await prisma.usuario.create({ data: {
        id_tipo_documento: documentType.id_tipo_documento,
        numeroDocumento: `${marker}-${users.length}`,
        nombre,
        email,
        id_rol: rolId,
        socio: false,
        id_estado_usuario: loginStatus.id_estado_usuario,
        matriculaPagada: false,
      } });
      users.push(user.id_usuario);
      await prisma.cuentaAutenticacion.create({ data: {
        id_usuario: user.id_usuario, proveedor: 'Local', email, password_hash: hash,
      } });
      const login = await request('POST', '/auth/login', 'anon', { email, password });
      assert.equal(login.status, 200, JSON.stringify(login.body));
      return { id: user.id_usuario, token: login.body?.token as string, nombre };
    }

    const operador = await crearUsuario(operatorRole.id_rol, 'Nombre operador');
    const primeraPersona = await crearUsuario(userRole.id_rol, 'Nombre primera');
    const segundaPersona = await crearUsuario(userRole.id_rol, 'Nombre segunda');
    const activity = await prisma.actividad.create({ data: {
      titulo: `${marker}-cupo`,
      id_estado_actividad: activityStatus.id_estado_actividad,
      importeSocio: new Prisma.Decimal('8.00'),
      importeNoSocio: new Prisma.Decimal('10.00'),
      aforo: 1,
    } });
    activities.push(activity.id_actividad);

    async function alta(userId: number) {
      return request('POST', '/inscripciones', operador.token, {
        id_usuario: userId,
        id_actividad: activity.id_actividad,
        id_estado_pago: paid.id_estado_pago,
        precioAplicado: 1,
        apuntadoFecha: '2026-10-14',
      });
    }

    const ocupante = await alta(operador.id);
    const primera = await alta(primeraPersona.id);
    const segunda = await alta(segundaPersona.id);
    assert.equal(ocupante.body?.id_estado_inscripcion, active.id_estado_inscripcion);
    assert.equal(primera.body?.id_estado_inscripcion, waiting.id_estado_inscripcion);
    assert.equal(segunda.body?.id_estado_inscripcion, waiting.id_estado_inscripcion);
    await prisma.inscripcionActividad.update({
      where: { id_inscripcion: primera.body?.id_inscripcion as number },
      data: { createAt: new Date('2026-10-01T10:00:00.000Z'), apuntadoFecha: new Date('2026-12-01') },
    });
    await prisma.inscripcionActividad.update({
      where: { id_inscripcion: segunda.body?.id_inscripcion as number },
      data: { createAt: new Date('2026-10-01T11:00:00.000Z'), apuntadoFecha: new Date('2019-01-01') },
    });

    async function nuestras(token: string) {
      const lista = await request('GET', '/inscripciones', token);
      assert.equal(lista.status, 200);
      return (lista.body as Array<Record<string, unknown>>).filter((fila) => fila.id_actividad === activity.id_actividad);
    }

    const llena = await nuestras(operador.token);
    const porId = new Map(llena.map((fila) => [fila.id_inscripcion, fila]));
    const filaOcupante = porId.get(ocupante.body?.id_inscripcion);
    const filaPrimera = porId.get(primera.body?.id_inscripcion);
    const filaSegunda = porId.get(segunda.body?.id_inscripcion);
    assert.equal(filaOcupante?.posicionEspera, null);
    assert.equal(filaOcupante?.puedePromocionar, false);
    assert.equal(filaPrimera?.posicionEspera, 1);
    assert.equal(filaSegunda?.posicionEspera, 2);
    assert.equal(filaPrimera?.puedePromocionar, false);
    assert.equal(filaSegunda?.puedePromocionar, false);
    assert.equal(filaPrimera?.plazasOcupadas, 1);
    assert.equal(filaPrimera?.plazasDisponibles, 0);
    assert.equal(filaPrimera?.aforo, 1);
    assert.equal(JSON.stringify(filaPrimera).includes('Nombre segunda'), false);

    await prisma.actividad.update({ where: { id_actividad: activity.id_actividad }, data: { aforo: null } });
    const ilimitada = await nuestras(operador.token);
    const libre = ilimitada.find((fila) => fila.id_inscripcion === primera.body?.id_inscripcion);
    const posterior = ilimitada.find((fila) => fila.id_inscripcion === segunda.body?.id_inscripcion);
    assert.equal(libre?.aforo, null);
    assert.equal(libre?.plazasDisponibles, null);
    assert.equal(libre?.puedePromocionar, true);
    assert.equal(posterior?.posicionEspera, 2);
    assert.equal(posterior?.puedePromocionar, false);

    await prisma.actividad.update({ where: { id_actividad: activity.id_actividad }, data: { aforo: 2 } });
    const numerica = await nuestras(operador.token);
    const conPlaza = numerica.find((fila) => fila.id_inscripcion === primera.body?.id_inscripcion);
    assert.equal(conPlaza?.plazasOcupadas, 1);
    assert.equal(conPlaza?.plazasDisponibles, 1);
    assert.equal(conPlaza?.aforo, 2);
    assert.equal(conPlaza?.puedePromocionar, true);

    const detalle = await request('GET', `/inscripciones/${primera.body?.id_inscripcion}`, operador.token);
    assert.equal(detalle.status, 200);
    assert.equal(detalle.body?.posicionEspera, 1);
    assert.equal(detalle.body?.puedePromocionar, true);
    assert.equal(JSON.stringify(detalle.body).includes('Nombre segunda'), false);

    const propias = await nuestras(segundaPersona.token);
    assert.equal(propias.length, 1);
    assert.equal(propias[0]?.posicionEspera, 2);
    assert.equal(JSON.stringify(propias).includes('Nombre primera'), false);
    assert.equal(JSON.stringify(propias).includes('Nombre operador'), false);

    await prisma.inscripcionActividad.update({
      where: { id_inscripcion: primera.body?.id_inscripcion as number },
      data: { id_estado_pago: cancelled.id_estado_pago },
    });
    const cancelada = (await nuestras(operador.token)).find((fila) => fila.id_inscripcion === primera.body?.id_inscripcion);
    assert.equal(cancelada?.posicionEspera, 1);
    assert.equal(cancelada?.puedePromocionar, false);
    assert.equal(pending.id_estado_pago > 0, true);
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
