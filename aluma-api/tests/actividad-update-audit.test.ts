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

test('Modificacion HTTP de actividades y auditoria atomica', async (t) => {
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
  const marker = `am-${randomUUID().slice(0, 8)}`;
  const ids: number[] = [];
  const activityIds: number[] = [];
  const requestIds: string[] = [];
  async function request(method: string, path: string, body: unknown, token?: string) {
    const response = await fetch(base + path, {
      method, headers: {
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
    const password = randomUUID();
    const hash = await bcrypt.hash(password, 4);
    const actors: { id: number; role: string; token: string }[] = [];
    for (const role of ['Operador', 'Administrador', 'Usuario']) {
      const dbRole = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: role } });
      const actor = await prisma.usuario.create({ data: {
        email: `${marker}-${ids.length}@aluma.test`, numeroDocumento: `${marker}-${ids.length}`,
        nombre: marker, id_tipo_documento: document.id_tipo_documento,
        id_rol: dbRole.id_rol, id_estado_usuario: state.id_estado_usuario,
        socio: false, matriculaPagada: false,
      } });
      ids.push(actor.id_usuario);
      await prisma.cuentaAutenticacion.create({ data: {
        id_usuario: actor.id_usuario, proveedor: 'Local', email: actor.email, password_hash: hash,
      } });
      const login = await request('POST', '/auth/login', { email: actor.email, password });
      assert.equal(login.status, 200);
      actors.push({ id: actor.id_usuario, role, token: login.body.token });
    }
    const activity = await prisma.actividad.create({ data: {
      titulo: marker, id_estado_actividad: activityState.id_estado_actividad,
      fecha: new Date('2026-10-01T00:00:00.000Z'), importeSocio: 10, importeNoSocio: 20,
    } });
    activityIds.push(activity.id_actividad);
    const where = { id_actividad: activity.id_actividad };
    const path = `/actividades/${activity.id_actividad}`;

    await t.test('Aforo: persistencia, consulta, actualizacion parcial y auditoria', async () => {
      assert.equal(activity.aforo, null);
      const token = actors[0]!.token;
      const result = await request('PUT', path, { aforo: 40 }, token);
      assert.equal(result.status, 200);
      assert.equal(result.body.aforo, 40);
      assert.equal((await prisma.actividad.findUniqueOrThrow({ where })).aforo, 40);
      const audit = await prisma.auditoria.findFirstOrThrow({ where: { requestId: result.requestId } });
      assert.deepEqual(audit.detalles, { cambios: { aforo: { anterior: null, nuevo: 40 } } });
      const partial = await request('PUT', path, { comentario: null }, token);
      assert.equal(partial.status, 200);
      assert.equal(partial.body.aforo, 40);
      for (const endpoint of [path, '/actividades']) {
        const response = await fetch(base + endpoint, { headers: { Authorization: `Bearer ${token}` } });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal((Array.isArray(body) ? body.find(row => row.id_actividad === activity.id_actividad) : body).aforo, 40);
      }
      for (const aforo of [0, -1, '40', 1.5]) {
        const invalid = await request('PUT', path, { aforo }, token);
        assert.equal(invalid.status, 400);
      }
      assert.equal((await prisma.actividad.findUniqueOrThrow({ where })).aforo, 40);
    });

    for (const actor of actors.slice(0, 2)) {
      await t.test(`${actor.role}: contexto correcto, cambios exactos y auditoria unica`, async () => {
        const before = await prisma.actividad.findUniqueOrThrow({ where });
        const titulo = `${marker}-${actor.role}`;
        const importeSocio = actor.role === 'Operador' ? 15 : 25;
        const fecha = actor.role === 'Operador' ? '2026-10-02T00:00:00.000Z' : null;
        const result = await request('PUT', path, { titulo, importeSocio, fecha, importeNoSocio: 20 }, actor.token);
        assert.equal(result.status, 200);
        const after = await prisma.actividad.findUniqueOrThrow({ where });
        assert.equal(after.titulo, titulo);
        assert.equal(after.importeSocio?.toFixed(2), importeSocio.toFixed(2));
        assert.equal(after.fecha?.toISOString() ?? null, fecha);
        const audits = await prisma.auditoria.findMany({ where: { requestId: result.requestId } });
        assert.equal(audits.length, 1);
        const audit = audits[0]!;
        assert.equal(audit.requestId, result.requestId);
        assert.equal(audit.id_usuario, actor.id);
        assert.equal(audit.rol_actor, actor.role);
        assert.equal(audit.accion, 'ACTIVIDAD_MODIFICADA');
        assert.equal(audit.recurso, 'ACTIVIDAD');
        assert.equal(audit.id_recurso, activity.id_actividad);
        assert.equal(audit.resultado, 'REALIZADA');
        assert.equal(audit.codigo_error, null);
        assert.deepEqual(audit.detalles, { cambios: {
          titulo: { anterior: before.titulo, nuevo: titulo },
          importeSocio: { anterior: before.importeSocio?.toFixed(2), nuevo: importeSocio.toFixed(2) },
          fecha: { anterior: before.fecha?.toISOString() ?? null, nuevo: fecha },
        } });
        // Misma fecha/Decimal recreados como objetos no deben producir diferencias.
        const unchanged = await request('PUT', path, { titulo, importeSocio, fecha, importeNoSocio: 20 }, actor.token);
        assert.equal(unchanged.status, 200);
        assert.equal(await prisma.auditoria.count({ where: { requestId: unchanged.requestId } }), 0);
      });
    }
    await t.test('Cambios desde y hacia NULL, comentario y normalizacion Zod', async () => {
      const before = await prisma.actividad.findUniqueOrThrow({ where });
      const result = await request('PUT', path, { importeSocio: null, comentario: '  Nota  ' }, actors[0]!.token);
      assert.equal(result.status, 200);
      const audit = await prisma.auditoria.findFirstOrThrow({ where: { requestId: result.requestId } });
      assert.deepEqual(audit.detalles, { cambios: {
        importeSocio: { anterior: before.importeSocio?.toFixed(2), nuevo: null },
        comentario: { anterior: null, nuevo: 'Nota' },
      } });
      const same = await request('PUT', path, { importeSocio: null, comentario: '  Nota  ' }, actors[0]!.token);
      assert.equal(same.status, 200);
      assert.equal(await prisma.auditoria.count({ where: { requestId: same.requestId } }), 0);
    });
    for (const afterInsert of [false, true]) {
      await t.test(`Rollback ${afterInsert ? 'despues' : 'antes'} de insertar auditoria`, async (subtest) => {
        const before = await prisma.actividad.findUniqueOrThrow({ where });
        const failure = new Error('Fallo controlado de auditoria de modificacion de actividad');
        const transactionMethod = prisma.$transaction;
        const originalTransaction = transactionMethod.bind(prisma);
        let calls = 0;
        let inserted = false;
        prisma.$transaction = (async (
          operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
        ) => originalTransaction(async (tx) => {
          const delegate = tx.auditoria;
          const createMethod = delegate.create;
          delegate.create = (async (args: Prisma.AuditoriaCreateArgs) => {
            calls++;
            assert.equal((await tx.actividad.findUniqueOrThrow({ where })).titulo, `${marker}-rollback`);
            assert.deepEqual(await prisma.actividad.findUnique({ where }), before);
            if (afterInsert) {
              await createMethod.call(delegate, args);
              inserted = true;
            }
            throw failure;
          }) as typeof delegate.create;
          try { return await operation(tx); }
          finally { delegate.create = createMethod; }
        }, options)) as typeof prisma.$transaction;
        const logMock = subtest.mock.method(console, 'error', () => {});
        try {
          const result = await request('PUT', path, { titulo: `${marker}-rollback` }, actors[0]!.token);
          assert.equal(result.status, 500);
          assert.equal(calls, 1);
          assert.equal(inserted, afterInsert);
          assert(logMock.mock.calls.some(call => String(call.arguments[0]).includes('INTERNAL_SERVER_ERROR')));
          assert(!logMock.mock.calls.some(call => call.arguments.includes(failure)));
          assert.deepEqual(await prisma.actividad.findUnique({ where }), before);
          assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
        } finally {
          prisma.$transaction = transactionMethod;
          logMock.mock.restore();
        }
      });
    }
    await t.test('Rechazos 401, 403, 400, 404 y 409 sin auditoria de exito', async () => {
      const missing = 2147483647;
      assert.equal(await prisma.estadoActividad.findUnique({ where: { id_estado_actividad: missing } }), null);
      assert.equal(await prisma.actividad.findUnique({ where: { id_actividad: missing } }), null);
      const before = await prisma.actividad.findUniqueOrThrow({ where });
      const cases = [
        { path, data: { titulo: marker }, token: undefined, status: 401 },
        { path, data: { titulo: marker }, token: actors[2]!.token, status: 403 },
        { path, data: { importeSocio: -1 }, token: actors[0]!.token, status: 400 },
        { path, data: {}, token: actors[0]!.token, status: 400 },
        { path: `/actividades/${missing}`, data: { titulo: marker }, token: actors[0]!.token, status: 404 },
        { path, data: { titulo: marker, id_estado_actividad: missing }, token: actors[0]!.token, status: 409 },
      ];
      for (const item of cases) {
        const result = await request('PUT', item.path, item.data, item.token);
        assert.equal(result.status, item.status);
        assert.deepEqual(await prisma.actividad.findUnique({ where }), before);
        assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
      }
    });
  } finally {
    const closed = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await closed;
    try {
      // Limpieza exclusiva de registros temporales de esta prueba.
      await prisma.$transaction(async (tx) => {
        await tx.auditoria.deleteMany({ where: { requestId: { in: requestIds } } });
        await tx.actividad.deleteMany({ where: { id_actividad: { in: activityIds } } });
        await tx.cuentaAutenticacion.deleteMany({ where: { id_usuario: { in: ids } } });
        await tx.usuario.deleteMany({ where: { id_usuario: { in: ids } } });
      });
    } finally { await prisma.$disconnect(); }
  }
});
