import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/config/prisma.js';
import { Prisma } from '../src/generated/prisma/client.js';
import activityRoutes from '../src/routes/actividad/routes.js';
import authRoutes from '../src/routes/auth/routes.js';
import enrollmentRoutes from '../src/routes/inscripcion-actividad/routes.js';
import { requestId } from '../src/middlewares/request-id.middleware.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';
import { prepararEstadoEnEspera, retirarEstadoEnEsperaDeLaPrueba } from './estadoInscripcionPrueba.js';

test('El aforo no baja de las plazas ocupadas', async () => {
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
  const marker = `af-${randomUUID().slice(0, 8)}`;
  const users: number[] = [];
  const activities: number[] = [];
  const requestIds: string[] = [];
  let estadoEspera = { id: 0, propio: false };

  async function request(method: string, path: string, body: unknown, token?: string) {
    const response = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
    });
    const id = response.headers.get('x-request-id');
    assert(id);
    requestIds.push(id);
    const texto = await response.text();
    return {
      status: response.status,
      body: texto ? JSON.parse(texto) as Record<string, unknown> : null,
      requestId: id,
    };
  }

  try {
    estadoEspera = await prepararEstadoEnEspera();
    const loginStatus = await prisma.estadoUsuario.findFirstOrThrow({ where: { permiteLogin: true } });
    const documentType = await prisma.tipoDocumentoIdentificacion.findFirstOrThrow();
    const activityStatus = await prisma.estadoActividad.findFirstOrThrow();
    const operatorRole = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: 'Operador' } });
    const pending = await prisma.estadoPago.findUniqueOrThrow({ where: { nombre_estado: 'Pendiente' } });
    const paid = await prisma.estadoPago.findUniqueOrThrow({ where: { nombre_estado: 'Pagado' } });
    const cancelled = await prisma.estadoPago.findUniqueOrThrow({ where: { nombre_estado: 'Cancelado' } });
    const active = await prisma.estadoInscripcion.findUniqueOrThrow({ where: { nombre: 'Activa' } });
    const waiting = await prisma.estadoInscripcion.findUniqueOrThrow({ where: { nombre: 'En espera' } });
    const closed = await prisma.estadoInscripcion.findUniqueOrThrow({ where: { nombre: 'Cerrada' } });
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

    await crearUsuario();
    const login = await request('POST', '/auth/login', { email: `${marker}-0@aluma.test`, password });
    assert.equal(login.status, 200);
    const token = login.body?.token as string;

    async function crearActividad(aforo: number) {
      const activity = await prisma.actividad.create({ data: {
        titulo: `${marker}-${activities.length}`,
        id_estado_actividad: activityStatus.id_estado_actividad,
        aforo,
        importeSocio: new Prisma.Decimal('8.00'),
        importeNoSocio: new Prisma.Decimal('10.00'),
      } });
      activities.push(activity.id_actividad);
      return activity.id_actividad;
    }

    async function inscribir(
      activityId: number,
      estado: { id_estado_inscripcion: number },
      pago: { id_estado_pago: number },
    ) {
      const userId = await crearUsuario();
      return prisma.inscripcionActividad.create({ data: {
        id_usuario: userId,
        id_actividad: activityId,
        id_estado_inscripcion: estado.id_estado_inscripcion,
        id_estado_pago: pago.id_estado_pago,
        apuntadoFecha: new Date('2026-10-14T00:00:00.000Z'),
        precioAplicado: new Prisma.Decimal('10.00'),
      } });
    }

    async function firmas(activityId: number) {
      const filas = await prisma.inscripcionActividad.findMany({
        where: { id_actividad: activityId },
        orderBy: { id_inscripcion: 'asc' },
        select: {
          id_inscripcion: true,
          id_estado_inscripcion: true,
          id_estado_pago: true,
          updateAt: true,
        },
      });
      return filas.map((fila) => ({
        ...fila,
        updateAt: fila.updateAt.toISOString(),
      }));
    }

    const cupo = await crearActividad(20);
    await inscribir(cupo, active, pending);
    await inscribir(cupo, active, pending);
    await inscribir(cupo, active, paid);
    await inscribir(cupo, waiting, pending);
    const path = `/actividades/${cupo}`;
    const antes = await prisma.actividad.findUniqueOrThrow({ where: { id_actividad: cupo } });
    const inscripciones = await firmas(cupo);

    const reducido = await request('PUT', path, { aforo: 2 }, token);
    assert.equal(reducido.status, 409, JSON.stringify(reducido.body));
    assert.equal(reducido.body?.code, 'AFORO_INSUFICIENTE');
    assert.equal(
      reducido.body?.message,
      'No puedes reducir el aforo a 2 plazas porque actualmente hay 3 ocupadas.',
    );
    const trasRechazo = await prisma.actividad.findUniqueOrThrow({ where: { id_actividad: cupo } });
    assert.equal(trasRechazo.aforo, 20);
    assert.equal(trasRechazo.updateAt.toISOString(), antes.updateAt.toISOString());
    assert.equal(await prisma.auditoria.count({ where: { requestId: reducido.requestId } }), 0);
    assert.deepEqual(await firmas(cupo), inscripciones);

    const igual = await request('PUT', path, { aforo: 3 }, token);
    assert.equal(igual.status, 200, JSON.stringify(igual.body));
    assert.equal(igual.body?.aforo, 3);
    assert.equal((await prisma.actividad.findUniqueOrThrow({ where: { id_actividad: cupo } })).aforo, 3);

    const ampliado = await request('PUT', path, { aforo: 25 }, token);
    assert.equal(ampliado.status, 200, JSON.stringify(ampliado.body));
    assert.equal(ampliado.body?.aforo, 25);

    const ilimitado = await request('PUT', path, { aforo: null }, token);
    assert.equal(ilimitado.status, 200, JSON.stringify(ilimitado.body));
    assert.equal(ilimitado.body?.aforo, null);
    assert.equal((await prisma.actividad.findUniqueOrThrow({ where: { id_actividad: cupo } })).aforo, null);
    assert.deepEqual(await firmas(cupo), inscripciones);

    const soloEspera = await crearActividad(20);
    await inscribir(soloEspera, waiting, pending);
    await inscribir(soloEspera, waiting, pending);
    await inscribir(soloEspera, closed, pending);
    await inscribir(soloEspera, active, cancelled);
    const minima = await request('PUT', `/actividades/${soloEspera}`, { aforo: 1 }, token);
    assert.equal(minima.status, 200, JSON.stringify(minima.body));
    assert.equal(minima.body?.aforo, 1);

    const carrera = await crearActividad(2);
    await inscribir(carrera, active, pending);
    const nuevo = await crearUsuario();
    const [baja, alta] = await Promise.all([
      request('PUT', `/actividades/${carrera}`, { aforo: 1 }, token),
      request('POST', '/inscripciones', {
        id_usuario: nuevo,
        id_actividad: carrera,
        id_estado_pago: pending.id_estado_pago,
        apuntadoFecha: '2026-10-14',
      }, token),
    ]);
    assert.equal(alta.status, 201, JSON.stringify(alta.body));
    assert.ok(baja.status === 200 || baja.status === 409, JSON.stringify(baja.body));
    const resultado = await prisma.actividad.findUniqueOrThrow({ where: { id_actividad: carrera } });
    const ocupadas = await prisma.inscripcionActividad.count({
      where: {
        id_actividad: carrera,
        id_estado_inscripcion: active.id_estado_inscripcion,
        id_estado_pago: { in: [pending.id_estado_pago, paid.id_estado_pago] },
      },
    });
    assert.ok(resultado.aforo === null || ocupadas <= resultado.aforo);
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
      await retirarEstadoEnEsperaDeLaPrueba(estadoEspera, tx);
    });
    await prisma.$disconnect();
  }
});
