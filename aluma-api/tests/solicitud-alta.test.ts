import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../src/config/prisma.js';
import { generateToken } from '../src/utils/jwt.js';
import { authenticateWithOAuth } from '../src/services/auth/oauth.service.js';
import { createRegistrationToken } from '../src/utils/registration-token.js';
import solicitudRoutes from '../src/routes/solicitud-alta/routes.js';
import authRoutes from '../src/routes/auth/routes.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';
import { requestId } from '../src/middlewares/request-id.middleware.js';
import type { Prisma } from '../src/generated/prisma/client.js';

test('SolicitudAlta y OAuth: integracion real de persistencia', async t => {
  const marker = `sa-${randomUUID().slice(0,8)}`;
  const emails: string[] = [];
  const app = express(); app.use(requestId); app.use(express.json());
  app.use('/api/solicitudes-alta', solicitudRoutes); app.use('/api/auth', authRoutes); app.use(errorMiddleware);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  async function request(method: string, path: string, token?: string, body?: unknown) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, ...(body !== undefined && { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  }
  function identity() { const email = `${marker}-${emails.length}@aluma.test`; emails.push(email); return { proveedor: 'Google' as const, external_id: email, email }; }
  try {
    const doc = await prisma.tipoDocumentoIdentificacion.findFirstOrThrow();
    const adminRole = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: 'Administrador' } });
    const adminIdentity = identity();
    const admin = await prisma.usuario.create({ data: { email: adminIdentity.email, numeroDocumento: `${marker}-admin`, nombre: marker, id_tipo_documento: doc.id_tipo_documento, id_rol: adminRole.id_rol, id_estado_usuario: 1, socio: false, matriculaPagada: false } });
    const adminToken = generateToken({ id_usuario: admin.id_usuario, rol: 'Administrador' });
    const memberIdentity = identity();
    const member = await prisma.usuario.create({ data: { email: memberIdentity.email, numeroDocumento: `${marker}-member`, nombre: marker, id_tipo_documento: doc.id_tipo_documento, id_rol: 1, id_estado_usuario: 1, socio: false, matriculaPagada: false } });
    const userToken = generateToken({ id_usuario: member.id_usuario, rol: 'Usuario' });
    const payload = () => ({ id_tipo_documento: doc.id_tipo_documento, numeroDocumento: `${marker}-${emails.length}`, nombre: marker, socio: true });
    async function submit() {
      const who = identity();
      const response = await request('POST', '/api/solicitudes-alta', createRegistrationToken(who), payload());
      assert.equal(response.status, 201, JSON.stringify(response.body));
      return { who, row: response.body };
    }
    await t.test('callback validado: required, formulario, pending y aprobacion seguida de login', async st => {
      const who = identity();
      const oldClientId = process.env.GOOGLE_CLIENT_ID;
      process.env.GOOGLE_CLIENT_ID = 'test-client';
      const tokenMock = st.mock.method(OAuth2Client.prototype, 'getToken', async () => ({ tokens: { id_token: 'test-id-token' } }));
      const verifyMock = st.mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => ({ getPayload: () => ({ sub: who.external_id, email: who.email, email_verified: true }) }));
      let registrationToken: string;
      try {
        const start = await fetch(base + '/api/auth/google/login', { redirect: 'manual' });
        assert.equal(start.status, 302);
        const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
        const cookie = start.headers.get('set-cookie')!.split(';')[0]!;
        assert.equal((await request('GET', '/api/auth/google/callback?code=verified-code')).body.code, 'INVALID_OAUTH_STATE');
        const response = await fetch(base + `/api/auth/google/callback?code=verified-code&state=${encodeURIComponent(state)}`, { headers: { Cookie: cookie } });
        const callback = { status: response.status, body: await response.json() };
        assert.equal(callback.status, 200); assert.equal(callback.body.type, 'registration_required');
        registrationToken = callback.body.registrationToken;
        assert.equal(tokenMock.mock.calls.length, 1); assert.equal(verifyMock.mock.calls.length, 1);
      } finally {
        tokenMock.mock.restore(); verifyMock.mock.restore();
        if (oldClientId === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = oldClientId;
      }
      assert.equal(await prisma.usuario.count({ where: { email: who.email } }), 0);
      assert.equal((await request('GET', '/api/solicitudes-alta', registrationToken!)).status, 401);
      assert.equal((await request('POST', '/api/solicitudes-alta', adminToken, payload())).status, 401);
      assert.equal((await request('POST', '/api/solicitudes-alta', registrationToken!, { ...payload(), matriculaPagada: true })).status, 400);
      assert.equal((await request('POST', '/api/solicitudes-alta', registrationToken!, { ...payload(), email: admin.email })).status, 400);
      const created = await request('POST', '/api/solicitudes-alta', registrationToken!, payload());
      assert.equal(created.status, 201); const id = created.body.id_solicitud;
      assert.equal(created.body.EstadoSolicitud.nombre, 'Pendiente');
      assert.equal((await authenticateWithOAuth('Google', who.external_id, who.email)).type, 'registration_pending');
      assert.equal((await request('POST', '/api/solicitudes-alta', registrationToken!, payload())).status, 409);
      assert.equal((await request('GET', '/api/solicitudes-alta/mi-solicitud', registrationToken!)).body.estado, 'Pendiente');
      assert.equal((await request('GET', `/api/solicitudes-alta/${id}`, userToken)).status, 403);
      assert.equal((await request('POST', `/api/solicitudes-alta/${id}/resolucion`, userToken, { decision: 'Aceptar' })).status, 403);
      const accepted = await request('POST', `/api/solicitudes-alta/${id}/resolucion`, adminToken, { decision: 'Aceptar' });
      assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
      assert.equal(accepted.body.EstadoSolicitud.nombre, 'Aceptada');
      assert.equal(accepted.body.id_administrador_resolucion, admin.id_usuario); assert(accepted.body.fechaResolucion);
      const user = await prisma.usuario.findUniqueOrThrow({ where: { email: who.email } });
      assert.equal(user.id_usuario, accepted.body.id_usuario_creado); assert.equal(user.id_rol, 1); assert.equal(user.id_estado_usuario, 1); assert.equal(user.matriculaPagada, false); assert.equal(user.socio, true);
      const account = await prisma.cuentaAutenticacion.findUniqueOrThrow({ where: { proveedor_external_id: { proveedor: 'Google', external_id: who.external_id } } });
      assert.equal(account.id_usuario, user.id_usuario); assert.equal(account.password_hash, null);
      const login = await authenticateWithOAuth('Google', who.external_id, who.email); assert.equal(login.type, 'login'); assert('token' in login && login.token);
      assert.equal((await request('POST', `/api/solicitudes-alta/${id}/resolucion`, adminToken, { decision: 'Aceptar' })).status, 409);
    });
    await t.test('rechazo, motivo obligatorio y estado visible sin crear usuario/cuenta', async () => {
      const { who, row } = await submit();
      assert.equal((await request('POST', `/api/solicitudes-alta/${row.id_solicitud}/resolucion`, adminToken, { decision: 'Rechazar', motivo: '' })).status, 400);
      assert.equal((await request('POST', `/api/solicitudes-alta/${row.id_solicitud}/resolucion`, adminToken, { decision: 'Pendiente' })).status, 400);
      const result = await request('POST', `/api/solicitudes-alta/${row.id_solicitud}/resolucion`, adminToken, { decision: 'Rechazar', motivo: 'No cumple requisitos' });
      for (const decision of ['Aceptar', 'Rechazar']) {
        assert.equal((await request('POST', `/api/solicitudes-alta/${row.id_solicitud}/resolucion`, adminToken, decision === 'Aceptar' ? { decision } : { decision, motivo: 'Otro motivo' })).status, 409);
      }
      assert.equal(result.status, 200); assert.equal(result.body.EstadoSolicitud.nombre, 'Rechazada');
      assert.equal(result.body.id_administrador_resolucion, admin.id_usuario); assert(result.body.fechaResolucion); assert.equal(result.body.motivoRechazo, 'No cumple requisitos');
      assert.equal(result.body.id_usuario_creado, null);
      assert.equal(await prisma.usuario.count({ where: { email: who.email } }), 0); assert.equal(await prisma.cuentaAutenticacion.count({ where: { email: who.email } }), 0);
      assert.equal((await authenticateWithOAuth('Google', who.external_id, who.email)).type, 'registration_rejected');
    });
    await t.test('resoluciones concurrentes: exactamente una decision', async () => {
      const { who, row } = await submit();
      // Ambas transacciones leen al administrador antes de competir por el bloqueo.
      const original = prisma.$transaction; const run = original.bind(prisma);
      let reads = 0; let release!: () => void;
      const ready = new Promise<void>(resolve => { release = resolve; });
      prisma.$transaction = (async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { isolationLevel?: Prisma.TransactionIsolationLevel }) => run(async tx => {
        const isolated = new Proxy(tx, {
          get(target, property) {
            if (property !== '$queryRaw') return Reflect.get(target, property);
            return async (...args: Parameters<typeof tx.$queryRaw>) => {
              if (++reads === 2) release();
              await ready;
              return tx.$queryRaw(...args);
            };
          },
        });
        return operation(isolated);
      }, options)) as typeof original;
      let results;
      try {
        results = await Promise.all(['Aceptar', 'Aceptar'].map(decision => request('POST', `/api/solicitudes-alta/${row.id_solicitud}/resolucion`, adminToken, { decision })));
      } finally { prisma.$transaction = original; }
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      assert.equal(results.find(r => r.status === 409)!.body.code, 'APPLICATION_ALREADY_RESOLVED');
      assert.equal(await prisma.usuario.count({ where: { email: who.email } }), 1); assert.equal(await prisma.cuentaAutenticacion.count({ where: { email: who.email } }), 1);
    });
    await t.test('fallo al crear cuenta revierte usuario y solicitud', async st => {
      const { who, row } = await submit();
      const original = prisma.$transaction; const run = original.bind(prisma);
      prisma.$transaction = (async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) => run(async tx => {
        const create = tx.cuentaAutenticacion.create;
        tx.cuentaAutenticacion.create = (async () => { throw new Error('Fallo controlado'); }) as typeof create;
        try { return await operation(tx); } finally { tx.cuentaAutenticacion.create = create; }
      })) as typeof original;
      const log = st.mock.method(console, 'error', () => {});
      try { assert.equal((await request('POST', `/api/solicitudes-alta/${row.id_solicitud}/resolucion`, adminToken, { decision: 'Aceptar' })).status, 500); }
      finally { prisma.$transaction = original; log.mock.restore(); }
      assert.equal(await prisma.usuario.count({ where: { email: who.email } }), 0);
      const unchanged = await prisma.solicitudAlta.findUniqueOrThrow({ where: { id_solicitud: row.id_solicitud }, include: { EstadoSolicitud: true } });
      assert.equal(unchanged.EstadoSolicitud.nombre, 'Pendiente'); assert.equal(unchanged.id_usuario_creado, null);
    });
    await t.test('alta duplicada concurrente y token manipulado', async () => {
      const who = identity(); const token = createRegistrationToken(who); const data = payload();
      assert.equal((await request('POST', '/api/solicitudes-alta', undefined, data)).status, 401);
      assert.equal((await request('POST', '/api/solicitudes-alta', `${token}invalid`, data)).status, 401);
      const results = await Promise.all([request('POST', '/api/solicitudes-alta', token, data), request('POST', '/api/solicitudes-alta', token, data)]);
      assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
      assert.equal(await prisma.solicitudAlta.count({ where: { email: who.email } }), 1);
    });
    await t.test('conflicto aparecido tras solicitud no vincula ni acepta silenciosamente', async () => {
      const { who, row } = await submit();
      await prisma.usuario.create({ data: { email: who.email, numeroDocumento: row.numeroDocumento, nombre: marker, id_tipo_documento: doc.id_tipo_documento, id_rol: 1, id_estado_usuario: 1, socio: false, matriculaPagada: false } });
      const result = await request('POST', `/api/solicitudes-alta/${row.id_solicitud}/resolucion`, adminToken, { decision: 'Aceptar' });
      assert.equal(result.status, 409); assert.equal(result.body.code, 'APPLICATION_IDENTITY_CONFLICT');
      const saved = await prisma.solicitudAlta.findUniqueOrThrow({ where: { id_solicitud: row.id_solicitud }, include: { EstadoSolicitud: true } });
      assert.equal(saved.EstadoSolicitud.nombre, 'Pendiente');
      assert.equal(await prisma.cuentaAutenticacion.count({ where: { email: who.email } }), 0);
    });
    await t.test('fallo al resolver revierte tambien cuenta ya creada', async st => {
      const { who, row } = await submit();
      const original = prisma.$transaction; const run = original.bind(prisma);
      let reached = false;
      prisma.$transaction = (async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) => run(async tx => {
        const update = tx.solicitudAlta.update;
        tx.solicitudAlta.update = (async () => {
          assert.equal(await tx.usuario.count({ where: { email: who.email } }), 1);
          assert.equal(await tx.cuentaAutenticacion.count({ where: { email: who.email } }), 1);
          reached = true; throw new Error('Fallo de resolucion');
        }) as typeof update;
        try { return await operation(tx); } finally { tx.solicitudAlta.update = update; }
      })) as typeof original;
      const log = st.mock.method(console, 'error', () => {});
      try { assert.equal((await request('POST', `/api/solicitudes-alta/${row.id_solicitud}/resolucion`, adminToken, { decision: 'Aceptar' })).status, 500); }
      finally { prisma.$transaction = original; log.mock.restore(); }
      assert(reached);
      assert.equal(await prisma.usuario.count({ where: { email: who.email } }), 0);
      assert.equal(await prisma.cuentaAutenticacion.count({ where: { email: who.email } }), 0);
      assert.equal((await prisma.solicitudAlta.findUniqueOrThrow({ where: { id_solicitud: row.id_solicitud }, include: { EstadoSolicitud: true } })).EstadoSolicitud.nombre, 'Pendiente');
    });
    await t.test('OAuth previo: usuario existente vincula y cuenta bloqueada rechaza login', async () => {
      const result = await authenticateWithOAuth('Google', adminIdentity.external_id, admin.email);
      assert.equal(result.type, 'linked');
      assert.equal((await authenticateWithOAuth('Google', adminIdentity.external_id, admin.email)).type, 'login');
      const blocked = await prisma.estadoUsuario.findFirstOrThrow({ where: { permiteLogin: false } });
      await prisma.usuario.update({ where: { id_usuario: admin.id_usuario }, data: { id_estado_usuario: blocked.id_estado_usuario } });
      await assert.rejects(authenticateWithOAuth('Google', adminIdentity.external_id, admin.email), (e: any) => e.code === 'LOGIN_NOT_ALLOWED');
      await prisma.usuario.update({ where: { id_usuario: admin.id_usuario }, data: { id_estado_usuario: 1 } });
    });
  } finally {
    const closed = once(server, 'close'); server.close(); server.closeAllConnections(); await closed;
    try { await prisma.$transaction(async tx => {
      await tx.solicitudAlta.deleteMany({ where: { email: { in: emails } } });
      await tx.cuentaAutenticacion.deleteMany({ where: { email: { in: emails } } });
      await tx.usuario.deleteMany({ where: { email: { in: emails } } });
    }); } finally { await prisma.$disconnect(); }
  }
});
