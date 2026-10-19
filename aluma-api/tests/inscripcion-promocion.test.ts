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

test('La promoción manual activa solo a la primera persona en espera si hay plaza', async () => {
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
  const marker = `promocion-${randomUUID().slice(0, 8)}`;
  const users: number[] = [];
  const activities: number[] = [];
  const requestIds: string[] = [];
  let estadoEspera = { id: 0, propio: false };

  async function request(method: string, path: string, token?: string, body?: unknown) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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
    const password = randomUUID();
    const hash = await bcrypt.hash(password, 4);
    const tokens: Record<string, string> = {};
    const ids: Record<string, number> = {};

    async function crearUsuario(rol: string) {
      const email = `${marker}-${users.length}@aluma.test`;
      const dbRole = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: rol } });
      const user = await prisma.usuario.create({ data: {
        id_tipo_documento: documentType.id_tipo_documento,
        numeroDocumento: `${marker}-${users.length}`,
        nombre: 'Nombre promocion',
        email,
        id_rol: dbRole.id_rol,
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

    for (const rol of ['Operador', 'Administrador', 'Usuario']) {
      ids[rol] = await crearUsuario(rol);
      const login = await request('POST', '/auth/login', undefined, {
        email: `${marker}-${users.length - 1}@aluma.test`, password,
      });
      assert.equal(login.status, 200, JSON.stringify(login.body));
      tokens[rol] = login.body?.token as string;
    }
    const personas = [];
    for (let i = 0; i < 10; i += 1) personas.push(await crearUsuario('Operador'));

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
      return request('POST', '/inscripciones', tokens.Operador, {
        id_usuario: userId,
        id_actividad: activityId,
        id_estado_pago: paid.id_estado_pago,
        precioAplicado: 1,
        apuntadoFecha: '2026-10-14',
      });
    }

    function activar(id: number, rol = 'Operador', body?: unknown) {
      return request('PATCH', `/inscripciones/${id}/activar`, tokens[rol], body);
    }

    async function fila(id: number) {
      return prisma.inscripcionActividad.findUniqueOrThrow({ where: { id_inscripcion: id } });
    }

    const cola = await crearActividad(1);
    const ocupante = await alta(personas[0]!, cola);
    const primera = await alta(personas[1]!, cola);
    const segunda = await alta(personas[2]!, cola);
    assert.equal(ocupante.body?.id_estado_inscripcion, active.id_estado_inscripcion);
    assert.equal(primera.body?.id_estado_inscripcion, waiting.id_estado_inscripcion);
    assert.equal(segunda.body?.id_estado_inscripcion, waiting.id_estado_inscripcion);
    const idOcupante = ocupante.body?.id_inscripcion as number;
    const idPrimera = primera.body?.id_inscripcion as number;
    const idSegunda = segunda.body?.id_inscripcion as number;
    await prisma.inscripcionActividad.update({
      where: { id_inscripcion: idSegunda },
      data: { apuntadoFecha: new Date('2019-01-01') },
    });
    const antesPrimera = await fila(idPrimera);

    const sinPermiso = await activar(idPrimera, 'Usuario');
    assert.equal(sinPermiso.status, 403);
    assert.equal(sinPermiso.body?.code, 'FORBIDDEN');
    assert.deepEqual(await fila(idPrimera), antesPrimera);
    assert.equal(await prisma.auditoria.count({ where: { requestId: sinPermiso.requestId } }), 0);

    const conCuerpo = await activar(idPrimera, 'Operador', {
      precioAplicado: 1, id_usuario: personas[3], id_actividad: cola,
    });
    assert.equal(conCuerpo.status, 400);
    assert.equal(conCuerpo.body?.code, 'VALIDATION_ERROR');
    assert.deepEqual(await fila(idPrimera), antesPrimera);
    assert.equal(await prisma.movimientoContable.count({ where: { id_inscripcion: idPrimera } }), 0);

    const fueraDeTurno = await activar(idSegunda);
    assert.equal(fueraDeTurno.status, 409);
    assert.equal(fueraDeTurno.body?.code, 'WAITLIST_PROMOTION_OUT_OF_TURN');
    assert.equal((await fila(idSegunda)).id_estado_inscripcion, waiting.id_estado_inscripcion);
    assert.equal(await prisma.auditoria.count({ where: { requestId: fueraDeTurno.requestId } }), 0);

    const sinPlaza = await activar(idPrimera);
    assert.equal(sinPlaza.status, 409);
    assert.equal(sinPlaza.body?.code, 'ENROLLMENT_CAPACITY_EXCEEDED');
    assert.deepEqual(await fila(idPrimera), antesPrimera);

    const yaActiva = await activar(idOcupante);
    assert.equal(yaActiva.status, 409);
    assert.equal(yaActiva.body?.code, 'ENROLLMENT_NOT_WAITING');
    assert.equal((await fila(idOcupante)).id_estado_inscripcion, active.id_estado_inscripcion);

    const porPut = await request('PUT', `/inscripciones/${idPrimera}`, tokens.Operador, {
      id_estado_inscripcion: active.id_estado_inscripcion,
    });
    assert.equal(porPut.status, 409);
    assert.equal(porPut.body?.code, 'ENROLLMENT_STATUS_TRANSITION_FORBIDDEN');
    assert.deepEqual(await fila(idPrimera), antesPrimera);

    const cierre = await request('PUT', `/inscripciones/${idOcupante}`, tokens.Operador, {
      id_estado_inscripcion: closed.id_estado_inscripcion,
    });
    assert.equal(cierre.status, 200, JSON.stringify(cierre.body));
    const promocion = await activar(idPrimera);
    assert.equal(promocion.status, 200, JSON.stringify(promocion.body));
    assert.equal(promocion.body?.id_estado_inscripcion, active.id_estado_inscripcion);
    assert.equal(promocion.body?.id_estado_pago, pending.id_estado_pago);
    assert.equal(promocion.body?.id_usuario, personas[1]);
    assert.equal(promocion.body?.id_actividad, cola);
    assert.equal(new Prisma.Decimal(promocion.body?.precioAplicado as string).toFixed(2), '10.00');
    const promovida = await fila(idPrimera);
    assert.equal(promovida.createAt.getTime(), antesPrimera.createAt.getTime());
    assert.equal(promovida.apuntadoFecha.getTime(), antesPrimera.apuntadoFecha.getTime());
    assert.equal(promovida.id_usuario, antesPrimera.id_usuario);
    assert.equal(promovida.id_actividad, antesPrimera.id_actividad);
    assert.equal(await prisma.movimientoContable.count({ where: { id_inscripcion: idPrimera } }), 0);
    const auditoria = await prisma.auditoria.findMany({ where: { requestId: promocion.requestId } });
    assert.equal(auditoria.length, 1);
    assert.equal(auditoria[0]!.accion, 'INSCRIPCION_ACTIVADA');
    assert.equal(auditoria[0]!.recurso, 'INSCRIPCION_ACTIVIDAD');
    assert.equal(auditoria[0]!.id_recurso, idPrimera);
    assert.equal(auditoria[0]!.id_usuario, ids.Operador);
    assert.equal(auditoria[0]!.rol_actor, 'Operador');
    assert.equal(auditoria[0]!.resultado, 'REALIZADA');
    assert.ok(auditoria[0]!.fecha_evento instanceof Date);
    assert.deepEqual(auditoria[0]!.detalles, {
      id_estado_inscripcion: { anterior: 'En espera', nuevo: 'Activa' },
    });
    const repetida = await activar(idPrimera);
    assert.equal(repetida.status, 409);
    assert.equal(repetida.body?.code, 'ENROLLMENT_NOT_WAITING');

    const inexistente = await activar(2147483647);
    assert.equal(inexistente.status, 404);
    assert.equal(inexistente.body?.code, 'ENROLLMENT_NOT_FOUND');

    const ilimitada = await crearActividad(1);
    await alta(personas[3]!, ilimitada);
    const esperaNula = await alta(personas[4]!, ilimitada);
    assert.equal(esperaNula.body?.id_estado_inscripcion, waiting.id_estado_inscripcion);
    await prisma.actividad.update({ where: { id_actividad: ilimitada }, data: { aforo: null } });
    const promocionNula = await activar(esperaNula.body?.id_inscripcion as number);
    assert.equal(promocionNula.status, 200, JSON.stringify(promocionNula.body));
    assert.equal(promocionNula.body?.id_estado_inscripcion, active.id_estado_inscripcion);
    assert.equal(promocionNula.body?.id_estado_pago, pending.id_estado_pago);

    const numerica = await crearActividad(1);
    await alta(personas[5]!, numerica);
    const esperaNumerica = await alta(personas[6]!, numerica);
    assert.equal(esperaNumerica.body?.id_estado_inscripcion, waiting.id_estado_inscripcion);
    await prisma.actividad.update({ where: { id_actividad: numerica }, data: { aforo: 2 } });
    const promocionNumerica = await activar(esperaNumerica.body?.id_inscripcion as number, 'Administrador');
    assert.equal(promocionNumerica.status, 200, JSON.stringify(promocionNumerica.body));
    assert.equal(promocionNumerica.body?.id_estado_inscripcion, active.id_estado_inscripcion);
    const auditoriaAdmin = await prisma.auditoria.findFirstOrThrow({ where: { requestId: promocionNumerica.requestId } });
    assert.equal(auditoriaAdmin.id_usuario, ids.Administrador);
    assert.equal(auditoriaAdmin.rol_actor, 'Administrador');
    assert.equal(auditoriaAdmin.accion, 'INSCRIPCION_ACTIVADA');

    const pagoDistinto = await crearActividad(1);
    await alta(personas[7]!, pagoDistinto);
    const esperaPagada = await alta(personas[8]!, pagoDistinto);
    const idPago = esperaPagada.body?.id_inscripcion as number;
    await prisma.inscripcionActividad.update({
      where: { id_inscripcion: idPago },
      data: { id_estado_pago: cancelled.id_estado_pago },
    });
    const antesPago = await fila(idPago);
    const pagoRechazado = await activar(idPago);
    assert.equal(pagoRechazado.status, 409);
    assert.equal(pagoRechazado.body?.code, 'ENROLLMENT_PAYMENT_NOT_PENDING');
    assert.deepEqual(await fila(idPago), antesPago);
    assert.equal(await prisma.movimientoContable.count({ where: { id_inscripcion: idPago } }), 0);

    const devolucion = await crearActividad(1);
    const cobrable = await alta(personas[9]!, devolucion);
    const trasDevolucion = await alta(personas[2]!, devolucion);
    assert.equal(trasDevolucion.body?.id_estado_inscripcion, waiting.id_estado_inscripcion);
    const cobro = await request('PUT', `/inscripciones/${cobrable.body?.id_inscripcion}`, tokens.Operador, {
      id_estado_pago: paid.id_estado_pago,
      id_metodo_pago: method.id_metodo_pago,
      fechaPago: '2026-10-14',
    });
    assert.equal(cobro.status, 200, JSON.stringify(cobro.body));
    const reembolso = await request('PUT', `/inscripciones/${cobrable.body?.id_inscripcion}`, tokens.Operador, {
      id_estado_pago: refunded.id_estado_pago,
    });
    assert.equal(reembolso.status, 200, JSON.stringify(reembolso.body));
    const idLiberada = trasDevolucion.body?.id_inscripcion as number;
    const precioLiberada = (await fila(idLiberada)).precioAplicado?.toFixed(2);
    const promocionLiberada = await activar(idLiberada);
    assert.equal(promocionLiberada.status, 200, JSON.stringify(promocionLiberada.body));
    assert.equal(promocionLiberada.body?.id_estado_inscripcion, active.id_estado_inscripcion);
    assert.equal((await fila(idLiberada)).precioAplicado?.toFixed(2), precioLiberada);
    assert.equal(await prisma.movimientoContable.count({ where: { id_inscripcion: idLiberada } }), 0);

    const carrera = await crearActividad(1);
    const bloquea = await alta(ids.Usuario, carrera);
    const cabeza = await alta(personas[4]!, carrera);
    const siguiente = await alta(personas[8]!, carrera);
    assert.equal(cabeza.body?.id_estado_inscripcion, waiting.id_estado_inscripcion);
    assert.equal(siguiente.body?.id_estado_inscripcion, waiting.id_estado_inscripcion);
    const cerrado = await request('PUT', `/inscripciones/${bloquea.body?.id_inscripcion}`, tokens.Administrador, {
      id_estado_inscripcion: closed.id_estado_inscripcion,
    });
    assert.equal(cerrado.status, 200, JSON.stringify(cerrado.body));
    const simultaneas = await Promise.all([
      activar(cabeza.body?.id_inscripcion as number, 'Operador'),
      activar(siguiente.body?.id_inscripcion as number, 'Administrador'),
    ]);
    assert.deepEqual(simultaneas.map((respuesta) => respuesta.status).sort(), [200, 409]);
    const ganadora = simultaneas.find((respuesta) => respuesta.status === 200);
    assert.equal(ganadora?.body?.id_inscripcion, cabeza.body?.id_inscripcion);
    assert.equal((await fila(cabeza.body?.id_inscripcion as number)).id_estado_inscripcion, active.id_estado_inscripcion);
    assert.equal((await fila(siguiente.body?.id_inscripcion as number)).id_estado_inscripcion, waiting.id_estado_inscripcion);
    assert.equal(await prisma.inscripcionActividad.count({
      where: {
        id_actividad: carrera,
        id_estado_inscripcion: active.id_estado_inscripcion,
        id_estado_pago: { in: [pending.id_estado_pago, paid.id_estado_pago] },
      },
    }), 1);
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
      const enrollmentIds = inscripciones.map((row) => row.id_inscripcion);
      await tx.movimientoContable.deleteMany({ where: { id_inscripcion: { in: enrollmentIds } } });
      await tx.inscripcionActividad.deleteMany({ where: { id_inscripcion: { in: enrollmentIds } } });
      await tx.actividad.deleteMany({ where: { id_actividad: { in: activities } } });
      await tx.cuentaAutenticacion.deleteMany({ where: { id_usuario: { in: users } } });
      await tx.usuario.deleteMany({ where: { id_usuario: { in: users } } });
    });
    await retirarEstadoEnEsperaDeLaPrueba(estadoEspera);
    await prisma.$disconnect();
  }
});
