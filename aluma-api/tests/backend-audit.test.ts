import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { prisma } from '../src/config/prisma.js';
import { generateToken } from '../src/utils/jwt.js';
import userRoutes from '../src/routes/usuario/routes.js';
import activityRoutes from '../src/routes/actividad/routes.js';
import enrollmentRoutes from '../src/routes/inscripcion-actividad/routes.js';
import movementRoutes from '../src/routes/movimiento-contable/routes.js';
import applicationRoutes from '../src/routes/solicitud-alta/routes.js';
import authRoutes from '../src/routes/auth/routes.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';
import { requestLogger } from '../src/middlewares/request-logger.middleware.js';
import { requestId } from '../src/middlewares/request-id.middleware.js';
import { createUserSchema } from '../src/dtos/usuario/create-user.dto.js';

test('Auditoria HTTP: proteccion, validacion y logs sin secretos', async t => {
  const original = prisma.usuario.findUnique;
  prisma.usuario.findUnique = (async () => ({ EstadoUsuario: { permiteLogin: true }, RolUsuario: { nombre_rol: 'Administrador' } })) as typeof original;
  const log = t.mock.method(console, 'log', () => {});
  const errors = t.mock.method(console, 'error', () => {});
  const app = express(); app.use(requestId); app.use(requestLogger); app.use(express.json({ limit: '1kb' }));
  app.use('/usuarios', userRoutes); app.use('/actividades', activityRoutes);
  app.use('/inscripciones', enrollmentRoutes); app.use('/movimientos', movementRoutes);
  app.use('/solicitudes', applicationRoutes); app.use('/auth', authRoutes);
  app.get('/failure', () => { throw new Error('password=private-database-secret'); });
  app.use(errorMiddleware);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  const token = generateToken({ id_usuario: 1, rol: 'Administrador' });
  async function request(method: string, path: string, body?: string, authenticated = false) {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(authenticated && { Authorization: `Bearer ${token}` }) },
      ...(body !== undefined && { body }),
    });
    return { status: response.status, body: await response.json() };
  }
  try {
    await t.test('todos los endpoints de negocio exigen credencial', async () => {
      for (const route of ['/usuarios', '/actividades', '/inscripciones', '/movimientos']) {
        for (const [method, suffix] of [['GET', ''], ['POST', ''], ['GET', '/1'], ['PUT', '/1'], ['DELETE', '/1']]) {
          assert.equal((await request(method!, route + suffix)).status, 401);
        }
      }
      for (const [method, path] of [['GET', '/auth/me'], ['GET', '/solicitudes'], ['GET', '/solicitudes/1'], ['POST', '/solicitudes/1/resolucion'], ['POST', '/solicitudes'], ['GET', '/solicitudes/mi-solicitud']]) {
        assert.equal((await request(method!, path!)).status, 401);
      }
    });
    await t.test('IDs invalidos, body ausente y dinero fuera de precision: 400', async () => {
      for (const route of ['/usuarios', '/actividades', '/inscripciones', '/movimientos', '/solicitudes']) {
        for (const id of ['0', '-1', '1.5', '2147483648', 'abc']) {
          assert.equal((await request('GET', `${route}/${id}`, undefined, true)).status, 400);
        }
      }
      assert.equal((await request('PUT', '/usuarios/1', undefined, true)).status, 400);
      for (const importe of [1.001, 100000000]) {
        assert.equal((await request('POST', '/actividades', JSON.stringify({ titulo: 'test', id_estado_actividad: 1, importeSocio: importe }), true)).status, 400);
        assert.equal((await request('POST', '/movimientos', JSON.stringify({ concepto: 'test', id_tipo_movimiento: 1, importe, fecha: '2026-10-01' }), true)).status, 400);
      }
      assert.equal((await request('POST', '/movimientos', JSON.stringify({ concepto: 'test', id_tipo_movimiento: 1, importe: 1, fecha: null }), true)).status, 400);
      assert.equal((await request('POST', '/actividades', JSON.stringify({ titulo: 'test', id_estado_actividad: 2147483648 }), true)).status, 400);
      assert.equal(createUserSchema.shape.email.safeParse('not-an-email').success, false);
    });
    await t.test('JSON malformado 400, body excesivo 413 y errores sin datos sensibles', async () => {
      assert.equal((await request('POST', '/auth/login', '{"password":"secret",')).status, 400);
      assert.equal((await request('POST', '/auth/login', JSON.stringify({ password: 'x'.repeat(2000) }))).status, 413);
      const failure = await request('GET', '/failure?code=oauth-private-code');
      assert.equal(failure.status, 500);
      assert.equal(failure.body.code, 'INTERNAL_SERVER_ERROR');
      const output = JSON.stringify([...log.mock.calls, ...errors.mock.calls].map(c => c.arguments));
      assert(!output.includes('oauth-private-code'));
      assert(!output.includes('private-database-secret'));
      assert(!output.includes('"password"'));
      assert(output.includes('requestId='));
    });
  } finally {
    prisma.usuario.findUnique = original;
    const closed = once(server, 'close'); server.close(); server.closeAllConnections(); await closed;
  }
});
