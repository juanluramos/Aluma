import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/config/prisma.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import userRoutes from '../src/routes/usuario/routes.js';
import authRoutes from '../src/routes/auth/routes.js';
import { requestId } from '../src/middlewares/request-id.middleware.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';

test('Creacion HTTP de usuarios y auditoria atomica', async (t) => {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/usuarios', userRoutes);
  app.use(errorMiddleware);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api`;
  const marker = `ua-${randomUUID().slice(0, 8)}`;
  const emails: string[] = [];
  const requestIds: string[] = [];
  const actors: { id: number; role: string; token: string }[] = [];

  async function post(path: string, body: unknown, token?: string) {
    const response = await fetch(base + path, {
      method: 'POST', headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
    });
    const id = response.headers.get('x-request-id');
    assert(id);
    requestIds.push(id);
    return { status: response.status, body: await response.json(), requestId: id };
  }

  try {
    const state = await prisma.estadoUsuario.findFirstOrThrow({ where: { permiteLogin: true } });
    const document = await prisma.tipoDocumentoIdentificacion.findFirstOrThrow();
    const userRole = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: 'Usuario' } });
    function payload() {
      const email = `${marker}-${emails.length}@aluma.test`;
      const numeroDocumento = `${marker}-${emails.length}`;
      emails.push(email);
      return {
        email, numeroDocumento, nombre: marker, id_tipo_documento: document.id_tipo_documento,
        id_rol: userRole.id_rol, id_estado_usuario: state.id_estado_usuario,
        socio: false, matriculaPagada: false,
      };
    }

    const password = randomUUID();
    const hash = await bcrypt.hash(password, 4);
    for (const role of ['Operador', 'Administrador']) {
      const dbRole = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: role } });
      const actor = await prisma.usuario.create({ data: { ...payload(), id_rol: dbRole.id_rol } });
      await prisma.cuentaAutenticacion.create({ data: {
        id_usuario: actor.id_usuario, proveedor: 'Local', email: actor.email, password_hash: hash,
      } });
      const login = await post('/auth/login', { email: actor.email, password });
      assert.equal(login.status, 200);
      assert.equal(typeof login.body.token, 'string');
      actors.push({ id: actor.id_usuario, role, token: login.body.token });
    }

    for (const actor of actors) {
      await t.test(`${actor.role}: HTTP 201, un usuario y exactamente una auditoria`, async () => {
        const data = payload();
        const result = await post('/usuarios', data, actor.token);
        assert.equal(result.status, 201, JSON.stringify(result.body));
        assert.notEqual(result.body.id_usuario, actor.id);
        const users = await prisma.usuario.findMany({ where: { email: data.email } });
        assert.equal(users.length, 1);
        assert.equal(users[0]!.id_usuario, result.body.id_usuario);
        const audits = await prisma.auditoria.findMany({ where: { requestId: result.requestId } });
        assert.equal(audits.length, 1);
        const audit = audits[0]!;
        assert.equal(audit.requestId, result.requestId);
        assert.equal(audit.id_usuario, actor.id);
        assert.equal(audit.rol_actor, actor.role);
        assert.equal(audit.accion, 'USUARIO_CREADO');
        assert.equal(audit.recurso, 'USUARIO');
        assert.equal(audit.id_recurso, result.body.id_usuario);
        assert.equal(audit.resultado, 'REALIZADA');
        assert.equal(audit.codigo_error, null);
        assert.equal(audit.detalles, null);
        assert.equal(await prisma.auditoria.count({ where: {
          accion: 'USUARIO_CREADO', recurso: 'USUARIO', id_recurso: result.body.id_usuario,
        } }), 1);
      });
    }

    for (const afterInsert of [false, true]) {
      await t.test(`Rollback si la auditoria falla ${afterInsert ? 'despues' : 'antes'} de insertarse`, async (subtest) => {
        const data = payload();
        const failure = new Error('Fallo controlado de escritura de auditoria');
        const transactionMethod = prisma.$transaction;
        const originalTransaction = transactionMethod.bind(prisma);
        let calls = 0;
        let userId = 0;
        // Los metodos dinamicos de Prisma requieren un stub restaurado explicitamente.
        prisma.$transaction = (
          async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
            originalTransaction(async (tx) => {
              const delegate = tx.auditoria;
              const createMethod = delegate.create;
              const originalCreate = createMethod.bind(delegate);
              delegate.create = (async (args: Prisma.AuditoriaCreateArgs) => {
                calls++;
                const user = await tx.usuario.findUnique({ where: { email: data.email } });
                assert(user, 'El usuario debe estar creado dentro de la misma transaccion');
                userId = user.id_usuario;
                assert.equal(args.data.id_recurso, userId);
                assert.equal(await prisma.usuario.findUnique({ where: { email: data.email } }), null);
                if (afterInsert) {
                  const audit = await originalCreate(args);
                  assert(await tx.auditoria.findUnique({ where: { id_auditoria: audit.id_auditoria } }));
                }
                throw failure;
              }) as typeof delegate.create;
              try { return await operation(tx); }
              finally { delegate.create = createMethod; }
            })) as typeof prisma.$transaction;
        const logMock = subtest.mock.method(console, 'error', () => {});
        try {
          const result = await post('/usuarios', data, actors[0]!.token);
          assert.equal(result.status, 500);
          assert.equal(result.body.code, 'INTERNAL_SERVER_ERROR');
          assert.equal(calls, 1);
          assert(userId > 0);
          assert(logMock.mock.calls.some(call => String(call.arguments[0]).includes('INTERNAL_SERVER_ERROR')));
          assert(!logMock.mock.calls.some(call => call.arguments.includes(failure)));
          assert.equal(await prisma.usuario.findUnique({ where: { email: data.email } }), null);
          assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
          assert.equal(await prisma.auditoria.count({ where: { recurso: 'USUARIO', id_recurso: userId } }), 0);
        } finally {
          prisma.$transaction = transactionMethod;
          logMock.mock.restore();
        }
      });
    }

    await t.test('Si falla la creacion del usuario no hay auditoria de exito', async () => {
      const data = payload();
      const result = await post('/usuarios', { ...data, email: emails[0] }, actors[0]!.token);
      assert.equal(result.status, 409);
      assert.equal(result.body.code, 'DUPLICATE_RESOURCE');
      assert.equal(await prisma.usuario.count({ where: { numeroDocumento: data.numeroDocumento } }), 0);
      assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
    });
  } finally {
    const closed = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await closed;
    try {
      // Solo registros identificados por los emails y UUIDs de esta ejecucion.
      await prisma.$transaction(async (tx) => {
        await tx.auditoria.deleteMany({ where: { requestId: { in: requestIds } } });
        const users = await tx.usuario.findMany({ where: { email: { in: emails } }, select: { id_usuario: true } });
        const ids = users.map(user => user.id_usuario);
        await tx.cuentaAutenticacion.deleteMany({ where: { id_usuario: { in: ids } } });
        await tx.usuario.deleteMany({ where: { id_usuario: { in: ids } } });
      });
    } finally {
      await prisma.$disconnect();
    }
  }
});
