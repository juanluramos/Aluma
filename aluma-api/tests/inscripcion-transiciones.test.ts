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

test('El PUT no salta la lista de espera ni supera el aforo', async () => {
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
  const marker = `transicion-${randomUUID().slice(0, 8)}`;
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
    return { status: response.status, body: texto ? JSON.parse(texto) as Record<string, unknown> : null, requestId: id };
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
    const method = await prisma.metodoPago.findFirstOrThrow();
    const operatorRole = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: 'Operador' } });
    const password = randomUUID();
    const hash = await bcrypt.hash(password, 4);

    async function crearUsuario() {
      const email = `${marker}-${users.length}@aluma.test`;
      const user = await prisma.usuario.create({ data: {
        id_tipo_documento: documentType.id_tipo_documento,
        numeroDocumento: `${marker}-${users.length}`,
        nombre: 'Nombre transicion',
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
    const login = await request('POST', '/auth/login', 'anon', {
      email: `${marker}-0@aluma.test`, password,
    });
    assert.equal(login.status, 200);
    const token = login.body?.token as string;
    const personas = [];
    for (let i = 0; i < 8; i += 1) personas.push(await crearUsuario());

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

    async function alta(userId: number, activityId: number) {
      return request('POST', '/inscripciones', token, {
        id_usuario: userId,
        id_actividad: activityId,
        id_estado_pago: paid.id_estado_pago,
        precioAplicado: 1,
        apuntadoFecha: '2026-10-14',
      });
    }

    async function fila(id: number) {
      return prisma.inscripcionActividad.findUniqueOrThrow({ where: { id_inscripcion: id } });
    }

    async function plazasOcupadas(activityId: number) {
      return prisma.inscripcionActividad.count({
        where: {
          id_actividad: activityId,
          id_estado_inscripcion: active.id_estado_inscripcion,
          id_estado_pago: { in: [pending.id_estado_pago, paid.id_estado_pago] },
        },
      });
    }

    const cupo = await crearActividad(1);
    const activa = await alta(personas[0]!, cupo);
    const espera = await alta(personas[1]!, cupo);
    assert.equal(activa.status, 201, JSON.stringify(activa.body));
    assert.equal(espera.status, 201, JSON.stringify(espera.body));
    assert.equal(activa.body?.id_estado_inscripcion, active.id_estado_inscripcion);
    assert.equal(espera.body?.id_estado_inscripcion, waiting.id_estado_inscripcion);
    const idActiva = activa.body?.id_inscripcion as number;
    const idEspera = espera.body?.id_inscripcion as number;
    const antesEspera = await fila(idEspera);

    const aActiva = await request('PUT', `/inscripciones/${idEspera}`, token, {
      id_estado_inscripcion: active.id_estado_inscripcion, comentario: 'no debe guardarse',
    });
    assert.equal(aActiva.status, 409);
    assert.equal(aActiva.body?.code, 'ENROLLMENT_STATUS_TRANSITION_FORBIDDEN');
    assert.deepEqual(await fila(idEspera), antesEspera);
    assert.equal(await prisma.auditoria.count({ where: { requestId: aActiva.requestId } }), 0);

    const activarYCobrar = await request('PUT', `/inscripciones/${idEspera}`, token, {
      id_estado_inscripcion: active.id_estado_inscripcion,
      id_estado_pago: paid.id_estado_pago,
      id_metodo_pago: method.id_metodo_pago,
      fechaPago: '2026-10-14',
    });
    assert.equal(activarYCobrar.status, 409);
    assert.equal(activarYCobrar.body?.code, 'ACTIVE_ENROLLMENT_REQUIRED');
    assert.deepEqual(await fila(idEspera), antesEspera);
    assert.equal(await prisma.movimientoContable.count({ where: { id_inscripcion: idEspera } }), 0);

    const soloCobro = await request('PUT', `/inscripciones/${idEspera}`, token, {
      id_estado_pago: paid.id_estado_pago,
      id_metodo_pago: method.id_metodo_pago,
      fechaPago: '2026-10-14',
    });
    assert.equal(soloCobro.status, 409);
    assert.equal(soloCobro.body?.code, 'ACTIVE_ENROLLMENT_REQUIRED');
    assert.deepEqual(await fila(idEspera), antesEspera);

    const idCerrada = (await alta(personas[2]!, await crearActividad(null))).body?.id_inscripcion as number;
    await prisma.inscripcionActividad.update({
      where: { id_inscripcion: idCerrada },
      data: { id_estado_inscripcion: closed.id_estado_inscripcion },
    });
    const antesCerrada = await fila(idCerrada);
    const reabrir = await request('PUT', `/inscripciones/${idCerrada}`, token, {
      id_estado_inscripcion: active.id_estado_inscripcion,
    });
    assert.equal(reabrir.status, 409);
    assert.equal(reabrir.body?.code, 'ENROLLMENT_STATUS_TRANSITION_FORBIDDEN');
    assert.deepEqual(await fila(idCerrada), antesCerrada);

    const antesActiva = await fila(idActiva);
    const aEspera = await request('PUT', `/inscripciones/${idActiva}`, token, {
      id_estado_inscripcion: waiting.id_estado_inscripcion,
    });
    assert.equal(aEspera.status, 409);
    assert.equal(aEspera.body?.code, 'ENROLLMENT_STATUS_TRANSITION_FORBIDDEN');
    assert.deepEqual(await fila(idActiva), antesActiva);

    const cobro = {
      id_estado_pago: paid.id_estado_pago,
      id_metodo_pago: method.id_metodo_pago,
      fechaPago: '2026-10-14',
    };
    const precio = await request('PUT', `/inscripciones/${idActiva}`, token, { ...cobro, precioAplicado: 99 });
    assert.equal(precio.status, 400);
    assert.equal(precio.body?.code, 'ENROLLMENT_PRICE_LOCKED');
    assert.deepEqual(await fila(idActiva), antesActiva);
    assert.equal(await prisma.movimientoContable.count({ where: { id_inscripcion: idActiva } }), 0);

    const pagada = await request('PUT', `/inscripciones/${idActiva}`, token, cobro);
    assert.equal(pagada.status, 200, JSON.stringify(pagada.body));
    assert.equal(pagada.body?.id_estado_inscripcion, active.id_estado_inscripcion);
    assert.equal(pagada.body?.id_estado_pago, paid.id_estado_pago);
    assert.equal(new Prisma.Decimal(pagada.body?.precioAplicado as string).toFixed(2), '10.00');
    assert.equal(await prisma.movimientoContable.count({ where: { id_inscripcion: idActiva } }), 1);

    const repetido = await request('PUT', `/inscripciones/${idActiva}`, token, cobro);
    assert.equal(repetido.status, 200);
    assert.equal(await prisma.movimientoContable.count({ where: { id_inscripcion: idActiva } }), 1);

    const comentario = 'Nota visible solo en la inscripción';
    const anotada = await request('PUT', `/inscripciones/${idActiva}`, token, { comentario });
    assert.equal(anotada.status, 200);
    assert.equal((await fila(idActiva)).comentario, comentario);
    const auditoria = await prisma.auditoria.findFirstOrThrow({ where: { requestId: anotada.requestId } });
    assert.equal(auditoria.accion, 'INSCRIPCION_MODIFICADA');
    assert.deepEqual(auditoria.detalles, { cambios: { comentario: { modificado: true } } });
    assert.equal(JSON.stringify(auditoria.detalles).includes(comentario), false);

    const devuelta = await request('PUT', `/inscripciones/${idActiva}`, token, {
      id_estado_pago: refunded.id_estado_pago,
    });
    assert.equal(devuelta.status, 200, JSON.stringify(devuelta.body));
    assert.equal(devuelta.body?.id_estado_inscripcion, closed.id_estado_inscripcion);
    assert.equal(devuelta.body?.id_estado_pago, refunded.id_estado_pago);
    assert.equal((await fila(idActiva)).comentario, comentario);
    const movimientosDevolucion = await prisma.movimientoContable.findMany({ where: { id_inscripcion: idActiva } });
    assert.equal(movimientosDevolucion.length, 2);
    assert.equal(movimientosDevolucion.reduce((suma, movimiento) => suma + Number(movimiento.importe), 0), 0);

    const actividadCancelada = await crearActividad(1);
    const cancelarActiva = await alta(personas[3]!, actividadCancelada);
    assert.equal(cancelarActiva.body?.id_estado_inscripcion, active.id_estado_inscripcion);
    const creadaActiva = await fila(cancelarActiva.body?.id_inscripcion as number);
    const cancelacionActiva = await request('PUT', `/inscripciones/${creadaActiva.id_inscripcion}`, token, {
      id_estado_pago: cancelled.id_estado_pago, comentario: 'baja',
    });
    assert.equal(cancelacionActiva.status, 200, JSON.stringify(cancelacionActiva.body));
    const filaCancelada = await fila(creadaActiva.id_inscripcion);
    assert.equal(filaCancelada.id_estado_inscripcion, closed.id_estado_inscripcion);
    assert.equal(filaCancelada.id_estado_pago, cancelled.id_estado_pago);
    assert.equal(filaCancelada.comentario, 'baja');
    assert.equal(filaCancelada.createAt.getTime(), creadaActiva.createAt.getTime());
    assert.equal(await prisma.movimientoContable.count({ where: { id_inscripcion: creadaActiva.id_inscripcion } }), 0);
    const reactivar = await request('PUT', `/inscripciones/${creadaActiva.id_inscripcion}`, token, {
      id_estado_pago: pending.id_estado_pago,
    });
    assert.equal(reactivar.status, 409);
    assert.equal(reactivar.body?.code, 'ENROLLMENT_REACTIVATION_FORBIDDEN');
    assert.deepEqual(await fila(creadaActiva.id_inscripcion), filaCancelada);

    const actividadEspera = await crearActividad(1);
    await alta(personas[4]!, actividadEspera);
    const enEspera = await alta(personas[5]!, actividadEspera);
    assert.equal(enEspera.body?.id_estado_inscripcion, waiting.id_estado_inscripcion);
    const creadaEspera = await fila(enEspera.body?.id_inscripcion as number);
    const cancelacionEspera = await request('PUT', `/inscripciones/${creadaEspera.id_inscripcion}`, token, {
      id_estado_pago: cancelled.id_estado_pago,
    });
    assert.equal(cancelacionEspera.status, 200, JSON.stringify(cancelacionEspera.body));
    const esperaCerrada = await fila(creadaEspera.id_inscripcion);
    assert.equal(esperaCerrada.id_estado_inscripcion, closed.id_estado_inscripcion);
    assert.equal(esperaCerrada.id_estado_pago, cancelled.id_estado_pago);
    assert.equal(esperaCerrada.createAt.getTime(), creadaEspera.createAt.getTime());
    assert.equal(await prisma.movimientoContable.count({ where: { id_inscripcion: creadaEspera.id_inscripcion } }), 0);

    const orden = await request('PUT', `/inscripciones/${creadaEspera.id_inscripcion}`, token, {
      createAt: '2020-01-01T00:00:00.000Z',
    });
    assert.equal(orden.status, 400);
    assert.equal(orden.body?.code, 'VALIDATION_ERROR');
    assert.equal((await fila(creadaEspera.id_inscripcion)).createAt.getTime(), creadaEspera.createAt.getTime());

    const carrera = await crearActividad(1);
    const ocupante = await alta(personas[6]!, carrera);
    assert.equal(ocupante.body?.id_estado_inscripcion, active.id_estado_inscripcion);
    const simultaneo = await Promise.all([
      request('PUT', `/inscripciones/${ocupante.body?.id_inscripcion}`, token, {
        id_estado_inscripcion: closed.id_estado_inscripcion,
      }),
      alta(personas[7]!, carrera),
    ]);
    assert.deepEqual(simultaneo.map((respuesta) => respuesta.status).sort(), [200, 201]);
    assert.ok(await plazasOcupadas(carrera) <= 1);

    const reembolso = await crearActividad(1);
    const cobrada = await alta(personas[0]!, reembolso);
    assert.equal(cobrada.body?.id_estado_inscripcion, active.id_estado_inscripcion);
    const cobroPrevio = await request('PUT', `/inscripciones/${cobrada.body?.id_inscripcion}`, token, cobro);
    assert.equal(cobroPrevio.status, 200, JSON.stringify(cobroPrevio.body));
    const paralelo = await Promise.all([
      request('PUT', `/inscripciones/${cobrada.body?.id_inscripcion}`, token, {
        id_estado_pago: refunded.id_estado_pago,
      }),
      alta(personas[1]!, reembolso),
    ]);
    assert.deepEqual(paralelo.map((respuesta) => respuesta.status).sort(), [200, 201]);
    assert.ok(await plazasOcupadas(reembolso) <= 1);
    assert.equal(await prisma.movimientoContable.count({
      where: { id_inscripcion: cobrada.body?.id_inscripcion as number },
    }), 2);
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
