import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/config/prisma.js';
import { JWT_SECRET } from '../src/config/jwt.js';
import { generateToken } from '../src/utils/jwt.js';
import { requireAuth, authenticate } from '../src/middlewares/auth/authenticate.middleware.js';
import { requireRole, authorize } from '../src/middlewares/auth/authorize.middleware.js';
import usuarioRoutes from '../src/routes/usuario/routes.js';
import { createRegistrationToken } from '../src/utils/registration-token.js';

test('Autenticacion y roles reutilizables', async t => {
  let currentRole = 'Usuario';
  const findUser = prisma.usuario.findUnique;
  prisma.usuario.findUnique = (async () => ({ EstadoUsuario: { permiteLogin: true }, RolUsuario: { nombre_rol: currentRole } })) as typeof findUser;
  t.after(() => { prisma.usuario.findUnique = findUser; });
  assert.equal(authenticate, requireAuth); assert.equal(authorize, requireRole);
  const app = express(); app.use(express.json());
  app.get('/identity', requireAuth, (req,res) => { res.json(req.user); });
  app.get('/admin', requireAuth, requireRole('Administrador'), (_req,res) => { res.sendStatus(204); });
  app.get('/staff', authenticate, authorize('Operador','Administrador'), (_req,res) => { res.sendStatus(204); });
  app.get('/no-identity', requireRole('Administrador'), (_req,res) => { res.sendStatus(204); });
  app.use('/usuarios', usuarioRoutes);
  const server = app.listen(0,'127.0.0.1'); await once(server,'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  async function request(path: string, authorization?: string, method = 'GET') {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method, headers: { ...(authorization && { Authorization: authorization }), 'Content-Type':'application/json' }, ...(method === 'POST' && {body:'{}'}) });
    return {status:response.status, body:response.status === 204 ? null : await response.json()};
  }
  const now = Math.floor(Date.now()/1000);
  try {
    await t.test('JWT ausente, Bearer mal formado, firma invalida y expiracion', async () => {
      const missing = await request('/identity'); assert.equal(missing.status,401); assert.equal(missing.body.code,'AUTH_TOKEN_REQUIRED');
      const valid = generateToken({id_usuario:1,rol:'Usuario'});
      for (const header of ['Bearer','Basic '+valid,'Bearer '+valid+' extra','Bearer  '+valid,'Bearer invalid', 'Bearer '+jwt.sign({id_usuario:1,rol:'Usuario'},'wrong-secret',{expiresIn:'1h'}), 'Bearer '+jwt.sign({id_usuario:1,rol:'Usuario',iat:now-120,exp:now-60},JWT_SECRET)]) {
        const result = await request('/identity',header); assert.equal(result.status,401); assert.equal(result.body.code,'INVALID_AUTH_TOKEN');
      }
    });
    await t.test('payload real validado y campos extras no propagados', async () => {
      for (const fields of [{id_usuario:0},{id_usuario:-1},{id_usuario:1.5},{id_usuario:'1'},{id_usuario:Number.MAX_SAFE_INTEGER+1},{rol:'Root'},{rol:3},{rol:null},{id_usuario:null}]) {
        const token = jwt.sign({id_usuario:1,rol:'Usuario',...fields},JWT_SECRET,{expiresIn:'1h'});
        assert.equal((await request('/identity','Bearer '+token)).status,401);
      }
      for (const token of [jwt.sign('text',JWT_SECRET), jwt.sign({id_usuario:1,rol:'Usuario'},JWT_SECRET), jwt.sign({id_usuario:1,rol:'Usuario',exp:now+60},JWT_SECRET,{noTimestamp:true})]) {
        assert.equal((await request('/identity','Bearer '+token)).status,401);
      }
      const result = await request('/identity','Bearer '+jwt.sign({id_usuario:1,rol:'Usuario',extra:'not propagated'},JWT_SECRET,{expiresIn:'1h'}));
      assert.equal(result.status,200); assert.deepEqual(Object.keys(result.body).sort(),['exp','iat','id_usuario','rol']);
    });
    await t.test('roles permitidos y denegados, aliases compatibles', async () => {
      for (const rol of ['Usuario','Operador','Administrador'] as const) {
        currentRole = rol;
        const token = 'Bearer '+generateToken({id_usuario:1,rol});
        assert.equal((await request('/identity',token)).status,200);
        const admin = await request('/admin',token); assert.equal(admin.status,rol === 'Administrador' ? 204 : 403);
        if (admin.status === 403) assert.equal(admin.body.code,'FORBIDDEN');
        assert.equal((await request('/staff',token)).status,rol === 'Usuario' ? 403 : 204);
      }
      const missing = await request('/no-identity'); assert.equal(missing.status,401); assert.equal(missing.body.code,'AUTHENTICATION_REQUIRED');
    });
    await t.test('credencial de alta no es JWT de acceso', async () => {
      const token = createRegistrationToken({proveedor:'Google',external_id:'test',email:'test@example.com'});
      assert.equal((await request('/identity','Bearer '+token)).status,401);
    });
    await t.test('unico POST usuarios: autenticar, autorizar y validar antes del controller', async () => {
      const posts = usuarioRoutes.stack.filter(layer => layer.route?.path === '/' && layer.route.methods.post);
      assert.equal(posts.length,1);
      assert.equal((await request('/usuarios',undefined,'POST')).status,401);
      for (const rol of ['Usuario','Operador','Administrador'] as const) {
        currentRole = rol;
        const result = await request('/usuarios','Bearer '+generateToken({id_usuario:1,rol}),'POST');
        assert.equal(result.status,rol === 'Usuario' ? 403 : 400);
      }
    });
  } finally { const closed = once(server,'close'); server.close(); server.closeAllConnections(); await closed; }
});
