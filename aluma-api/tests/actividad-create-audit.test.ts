import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/config/prisma.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import activityRoutes from '../src/routes/actividad/routes.js';
import authRoutes from '../src/routes/auth/routes.js';
import { requestId } from '../src/middlewares/request-id.middleware.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';

test('Creacion HTTP de actividades y auditoria atomica', async (t) => {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/actividades', activityRoutes);
  app.use(errorMiddleware);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api`;
  const marker = `ac-${randomUUID()}`;
  const ids: number[] = [];
  const titles: string[] = [];
  const requestIds: string[] = [];
  async function post(path: string, body: unknown, token?: string) {
    const response = await fetch(base + path, {
      method: 'POST', headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      }, body: JSON.stringify(body),
    });
    const id = response.headers.get('x-request-id');
    assert(id);
    requestIds.push(id);
    return { status: response.status, body: await response.json(), requestId: id };
  }
  try {
    const state = await prisma.estadoUsuario.findFirstOrThrow({ where: { permiteLogin: true } });
    const document = await prisma.tipoDocumentoIdentificacion.findFirstOrThrow();
    const activityState = await prisma.estadoActividad.findFirstOrThrow();
    function payload() {
      const titulo = `${marker}-${titles.length}`;
      titles.push(titulo);
      return { titulo, id_estado_actividad: activityState.id_estado_actividad, importeSocio: 10 };
    }
    const password = randomUUID();
    const hash = await bcrypt.hash(password, 4);
    const actors: { id: number; role: string; token: string }[] = [];
    for (const role of ['Operador', 'Administrador', 'Usuario']) {
      const dbRole = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: role } });
      const actor = await prisma.usuario.create({ data: {
        email: `${marker}-${ids.length}@aluma.test`, numeroDocumento: `${marker.slice(0, 12)}-${ids.length}`,
        nombre: marker, id_tipo_documento: document.id_tipo_documento,
        id_rol: dbRole.id_rol, id_estado_usuario: state.id_estado_usuario,
        socio: false, matriculaPagada: false,
      } });
      ids.push(actor.id_usuario);
      await prisma.cuentaAutenticacion.create({ data: {
        id_usuario: actor.id_usuario, proveedor: 'Local', email: actor.email, password_hash: hash,
      } });
      const login = await post('/auth/login', { email: actor.email, password });
      assert.equal(login.status, 200);
      actors.push({ id: actor.id_usuario, role, token: login.body.token });
    }
    for (const actor of actors.slice(0, 2)) {
      await t.test(`${actor.role}: HTTP 201, actividad y unica auditoria con contexto correcto`, async () => {
        const data = payload();
        const result = await post('/actividades', data, actor.token);
        assert.equal(result.status, 201);
        const activities = await prisma.actividad.findMany({ where: { titulo: data.titulo } });
        assert.equal(activities.length, 1);
        assert.equal(activities[0]!.id_actividad, result.body.id_actividad);
        const audits = await prisma.auditoria.findMany({ where: { requestId: result.requestId } });
        assert.equal(audits.length, 1);
        const audit = audits[0]!;
        assert.equal(audit.requestId, result.requestId);
        assert.equal(audit.id_usuario, actor.id);
        assert.equal(audit.rol_actor, actor.role);
        assert.equal(audit.accion, 'ACTIVIDAD_CREADA');
        assert.equal(audit.recurso, 'ACTIVIDAD');
        assert.equal(audit.id_recurso, result.body.id_actividad);
        assert.equal(audit.resultado, 'REALIZADA');
        assert.equal(audit.codigo_error, null);
        assert.equal(audit.detalles, null);
        assert.equal(await prisma.auditoria.count({ where: {
          accion: 'ACTIVIDAD_CREADA', recurso: 'ACTIVIDAD', id_recurso: result.body.id_actividad,
        } }), 1);
      });
    }
    for (const afterInsert of [false, true]) {
      await t.test(`Rollback ${afterInsert ? 'despues' : 'antes'} de insertar auditoria`, async (subtest) => {
        const data = payload();
        const failure = new Error('Fallo controlado de auditoria de actividad');
        const transactionMethod = prisma.$transaction;
        const originalTransaction = transactionMethod.bind(prisma);
        let calls = 0;
        let inserted = false;
        // Stub temporal sobre una transaccion real, restaurado en finally.
        prisma.$transaction = (async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          originalTransaction(async (tx) => {
            const delegate = tx.auditoria;
            const createMethod = delegate.create;
            delegate.create = (async (args: Prisma.AuditoriaCreateArgs) => {
              calls++;
              const activity = await tx.actividad.findFirstOrThrow({ where: { titulo: data.titulo } });
              assert.equal(args.data.id_recurso, activity.id_actividad);
              assert.equal(await prisma.actividad.count({ where: { titulo: data.titulo } }), 0);
              if (afterInsert) {
                await createMethod.call(delegate, args);
                inserted = true;
              }
              throw failure;
            }) as typeof delegate.create;
            try { return await operation(tx); }
            finally { delegate.create = createMethod; }
          })) as typeof prisma.$transaction;
        const logMock = subtest.mock.method(console, 'error', () => {});
        try {
          const result = await post('/actividades', data, actors[0]!.token);
          assert.equal(result.status, 500);
          assert.equal(calls, 1);
          assert.equal(inserted, afterInsert);
          assert(logMock.mock.calls.some(call => String(call.arguments[0]).includes('INTERNAL_SERVER_ERROR')));
          assert(!logMock.mock.calls.some(call => call.arguments.includes(failure)));
          assert.equal(await prisma.actividad.count({ where: { titulo: data.titulo } }), 0);
          assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
        } finally {
          prisma.$transaction = transactionMethod;
          logMock.mock.restore();
        }
      });
    }
    await t.test('Rechazos por autenticacion, permisos, validacion y FK no crean actividad ni auditoria', async () => {
      const invalidState = 2147483647;
      assert.equal(await prisma.estadoActividad.findUnique({ where: { id_estado_actividad: invalidState } }), null);
      const cases = [
        { data: payload(), token: undefined, status: 401 },
        { data: payload(), token: actors[2]!.token, status: 403 },
        { data: { ...payload(), importeSocio: -1 }, token: actors[0]!.token, status: 400 },
        { data: { ...payload(), id_estado_actividad: invalidState }, token: actors[0]!.token, status: 409 },
      ];
      for (const item of cases) {
        const result = await post('/actividades', item.data, item.token);
        assert.equal(result.status, item.status, JSON.stringify(result.body));
        assert.equal(await prisma.actividad.count({ where: { titulo: item.data.titulo } }), 0);
        assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
      }
    });
  } finally {
    const closed = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await closed;
    try {
      // Limpieza limitada a los registros creados por esta ejecucion.
      await prisma.$transaction(async (tx) => {
        await tx.auditoria.deleteMany({ where: { requestId: { in: requestIds } } });
        await tx.actividad.deleteMany({ where: { titulo: { in: titles } } });
        await tx.cuentaAutenticacion.deleteMany({ where: { id_usuario: { in: ids } } });
        await tx.usuario.deleteMany({ where: { id_usuario: { in: ids } } });
      });
    } finally { await prisma.$disconnect(); }
  }
});
