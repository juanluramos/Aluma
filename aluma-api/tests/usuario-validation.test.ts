import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomInt, randomUUID } from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/config/prisma.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import { createUserSchema } from '../src/dtos/usuario/create-user.dto.js';
import { updateUserSchema } from '../src/dtos/usuario/update-user.dto.js';
import { documentoUsuarioSchema, passwordUsuarioSchema } from '../src/utils/validacionesUsuario.js';
import userRoutes from '../src/routes/usuario/routes.js';
import authRoutes from '../src/routes/auth/routes.js';
import { requestId } from '../src/middlewares/request-id.middleware.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';
import { initSocket } from '../src/socket/socket.js';

const validPassword = 'AlumaPrueba2026';
const documentLetters = 'TRWAGMYFPDXBNJZSQVHLCKE';
const dni = () => {
  const number = randomInt(10_000_000, 100_000_000);
  return `${number}${documentLetters[number % 23]}`;
};
const nie = () => {
  const number = randomInt(1_000_000, 10_000_000);
  return `X${number}${documentLetters[number % 23]}`;
};

for (const [type, value, normalized] of [
  [1, ' 12345678z ', '12345678Z'], [2, ' x1234567l ', 'X1234567L'],
  [3, ' ab12345 ', 'AB12345'], [4, ' pt-2025-abc ', 'PT-2025-ABC'],
] as const) {
  test(`Documento ${type}: ejemplo valido y normalizacion`, () => {
    assert.equal(documentoUsuarioSchema.parse({ id_tipo_documento: type, numeroDocumento: value }).numeroDocumento, normalized);
  });
}

test('DTO parcial no incorpora campos ausentes; codigo vacio se convierte en null', () => {
  assert.deepEqual(updateUserSchema.parse({ comentario: '  Nota  ' }), { comentario: 'Nota' });
  assert.deepEqual(updateUserSchema.parse({ codUsuario: '   ' }), { codUsuario: null });
  assert.deepEqual(updateUserSchema.parse({ codUsuario: ' ab-1_x ' }), { codUsuario: 'AB-1_X' });
  assert.equal(updateUserSchema.safeParse({}).success, false);
  assert.equal(createUserSchema.shape.email.parse('  PERSONA@EXAMPLE.TEST  '), 'persona@example.test');
});

test('Bcrypt no trunca contraseñas: limite de 72 bytes, no de caracteres', () => {
  assert(passwordUsuarioSchema.safeParse('Aa1' + 'a'.repeat(69)).success);
  assert.equal(passwordUsuarioSchema.safeParse('Aa1' + 'a'.repeat(70)).success, false);
  assert.equal(passwordUsuarioSchema.safeParse('Aa1' + 'ñ'.repeat(35)).success, false);
  assert.equal(passwordUsuarioSchema.parse(' Asegurada1 '), ' Asegurada1 ');
});

type Body = {
  id_usuario?: number;
  token?: string;
  code?: string;
  message?: string;
  errors?: { message: string; path: (string | number)[] }[];
  [key: string]: unknown;
};

test('Usuarios: validaciones criticas POST/PUT con HTTP y MariaDB', async t => {
  const app = express(); app.use(requestId); app.use(express.json());
  app.use('/api/auth', authRoutes); app.use('/api/usuarios', userRoutes); app.use(errorMiddleware);
  const server = app.listen(0, '127.0.0.1'); initSocket(server); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api`;
  const marker = `val-${randomUUID().slice(0, 8)}`;
  const userIds: number[] = [];
  const requestIds: string[] = [];
  const tokens: Record<string, string> = {};
  let sequence = 0;
  async function request(method: string, path: string, data?: unknown, role = 'Administrador') {
    const response = await fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json', ...(tokens[role] && { Authorization: `Bearer ${tokens[role]}` }) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    const id = response.headers.get('x-request-id'); assert(id); requestIds.push(id);
    const body = await response.json() as Body;
    if (method === 'POST' && path === '/usuarios' && typeof body.id_usuario === 'number') userIds.push(body.id_usuario);
    return { status: response.status, body, requestId: id };
  }
  const expectStatus = (result: { status: number; body: Body }, status: number) => assert.equal(result.status, status, JSON.stringify(result.body));
  try {
    const state = await prisma.estadoUsuario.findFirstOrThrow({ where: { permiteLogin: true } });
    const roleUser = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: 'Usuario' } });
    const hash = await bcrypt.hash(validPassword, 4);
    for (const role of ['Administrador', 'Operador', 'Usuario']) {
      const dbRole = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: role } });
      const actor = await prisma.usuario.create({ data: {
        email: `${marker}-${role.toLowerCase()}@example.test`, numeroDocumento: dni(), nombre: `Persona ${role}`,
        id_tipo_documento: 1, id_rol: dbRole.id_rol, id_estado_usuario: state.id_estado_usuario, socio: false, matriculaPagada: false,
      } });
      userIds.push(actor.id_usuario);
      await prisma.cuentaAutenticacion.create({ data: { id_usuario: actor.id_usuario, email: actor.email, proveedor: 'Local', password_hash: hash } });
      const result = await request('POST', '/auth/login', { email: actor.email, password: validPassword }, '');
      expectStatus(result, 200); assert(result.body.token); tokens[role] = result.body.token;
    }
    function payload() {
      sequence++;
      return {
        email: `${marker}-${sequence}@example.test`, numeroDocumento: `${marker.replace(/-/g, '').toUpperCase()}${sequence}`,
        id_tipo_documento: 3, nombre: 'María-José', apellido1: 'Núñez', apellido2: 'De la Peña',
        id_rol: roleUser.id_rol, id_estado_usuario: state.id_estado_usuario, socio: false, matriculaPagada: false,
      };
    }
    async function create(overrides: Record<string, unknown> = {}, role = 'Administrador') {
      const data = { ...payload(), ...overrides };
      const result = await request('POST', '/usuarios', data, role);
      expectStatus(result, 201); assert(result.body.id_usuario);
      const row = await prisma.usuario.findUniqueOrThrow({ where: { id_usuario: result.body.id_usuario } });
      return { data, result, row };
    }

    await t.test('Documentos validos: DNI/NIE en minusculas, pasaporte y permiso de 30 caracteres', async () => {
      for (const [type, document] of [[1, dni()], [2, nie()], [3, 'P' + randomUUID().replaceAll('-', '').slice(0, 19)], [4, 'PT-' + randomUUID().replaceAll('-', '').slice(0, 27)]] as const) {
        const { row } = await create({ id_tipo_documento: type, numeroDocumento: `  ${document.toLowerCase()}  ` });
        assert.equal(row.numeroDocumento, document.toUpperCase());
        assert.equal(row.id_tipo_documento, type);
      }
    });
    await t.test('Alta local normaliza datos, conserva contraseña solo como hash y permite login', async () => {
      const baseData = payload();
      const code = 'C' + randomUUID().replaceAll('-', '').slice(0, 8);
      const result = await request('POST', '/usuarios', { ...baseData,
        email: `  ${baseData.email.toUpperCase()}  `, numeroDocumento: baseData.numeroDocumento.toLowerCase(),
        codUsuario: ` ${code.toLowerCase()} `, telefono: '+34 612 345 678',
        nombre: '  María-José  ', apellido1: '  Núñez  ', comentario: '  Comentario  ', password: validPassword,
      }, 'Operador');
      expectStatus(result, 201); assert(result.body.id_usuario);
      const row = await prisma.usuario.findUniqueOrThrow({ where: { id_usuario: result.body.id_usuario } });
      assert.equal(row.email, baseData.email); assert.equal(row.numeroDocumento, baseData.numeroDocumento);
      assert.equal(row.codUsuario, code.toUpperCase()); assert.equal(row.telefono, '+34612345678');
      assert.equal(row.nombre, 'María-José'); assert.equal(row.apellido1, 'Núñez'); assert.equal(row.comentario, 'Comentario');
      const account = await prisma.cuentaAutenticacion.findFirstOrThrow({ where: { id_usuario: row.id_usuario, proveedor: 'Local' } });
      assert(account.password_hash); assert.equal(account.email, row.email);
      assert(await bcrypt.compare(validPassword, account.password_hash)); assert.equal(bcrypt.getRounds(account.password_hash), 12);
      assert.notEqual(account.password_hash, validPassword);
      const audits = await prisma.auditoria.findMany({ where: { requestId: result.requestId } });
      assert.equal(audits.length, 1);
      for (const serialized of [JSON.stringify(result.body), JSON.stringify(audits, (_, value: unknown) => typeof value === 'bigint' ? String(value) : value)]) {
        assert(!serialized.includes(validPassword)); assert(!serialized.includes(account.password_hash)); assert(!serialized.includes('password'));
      }
      expectStatus(await request('POST', '/auth/login', { email: row.email, password: validPassword }, ''), 200);
    });
    await t.test('Telefono movil/fijo y codigo opcional; sin password no crea cuenta local', async () => {
      for (const telefono of ['612345678', '712345678', '912345678', '812345678', '+34 612 345 678']) {
        const { row } = await create({ telefono, codUsuario: '  ' });
        assert.equal(row.telefono, telefono.replace(/\s/g, '')); assert.equal(row.codUsuario, null);
        assert.equal(await prisma.cuentaAutenticacion.count({ where: { id_usuario: row.id_usuario } }), 0);
      }
      const { row } = await create(); assert.equal(row.codUsuario, null); assert.equal(row.telefono, null);
    });

    const invalidCases: { name: string; data: Record<string, unknown>; message: string }[] = [
      { name: 'DNI letra', data: { id_tipo_documento: 1, numeroDocumento: '12345678A' }, message: 'El DNI no es válido.' },
      { name: 'DNI formato', data: { id_tipo_documento: 1, numeroDocumento: '1234Z' }, message: 'El DNI no es válido.' },
      { name: 'DNI vacio', data: { id_tipo_documento: 1, numeroDocumento: ' ' }, message: 'El DNI no es válido.' },
      { name: 'NIE letra', data: { id_tipo_documento: 2, numeroDocumento: 'X1234567A' }, message: 'El NIE no es válido.' },
      { name: 'NIE formato', data: { id_tipo_documento: 2, numeroDocumento: 'A1234567L' }, message: 'El NIE no es válido.' },
      { name: 'Pasaporte corto', data: { numeroDocumento: 'ABC1' }, message: 'El pasaporte no tiene un formato válido.' },
      { name: 'Pasaporte largo', data: { numeroDocumento: 'A'.repeat(21) }, message: 'El pasaporte no tiene un formato válido.' },
      { name: 'Pasaporte caracteres', data: { numeroDocumento: 'ABC-123' }, message: 'El pasaporte no tiene un formato válido.' },
      { name: 'Permiso caracteres', data: { id_tipo_documento: 4, numeroDocumento: 'ABC/123' }, message: 'El permiso de trabajo no tiene un formato válido.' },
      { name: 'Permiso solo guiones', data: { id_tipo_documento: 4, numeroDocumento: '-----' }, message: 'El permiso de trabajo no tiene un formato válido.' },
      { name: 'Permiso corto', data: { id_tipo_documento: 4, numeroDocumento: 'ABC1' }, message: 'El permiso de trabajo no tiene un formato válido.' },
      { name: 'Permiso largo', data: { id_tipo_documento: 4, numeroDocumento: 'A'.repeat(31) }, message: 'El permiso de trabajo no tiene un formato válido.' },
      { name: 'Telefono longitud', data: { telefono: '61234' }, message: 'El teléfono no es válido.' },
      { name: 'Telefono letras', data: { telefono: '612ABC678' }, message: 'El teléfono no es válido.' },
      { name: 'Telefono extranjero', data: { telefono: '+33 612 345 678' }, message: 'El teléfono no es válido.' },
      { name: 'Telefono personal no movil/fijo', data: { telefono: '701234567' }, message: 'El teléfono no es válido.' },
      { name: 'Email', data: { email: 'incorrecto' }, message: 'El email no es válido.' },
      { name: 'Codigo caracteres', data: { codUsuario: 'AB*12' }, message: 'El código de usuario no tiene un formato válido.' },
      { name: 'Codigo largo', data: { codUsuario: 'A'.repeat(11) }, message: 'El código de usuario no tiene un formato válido.' },
      { name: 'Nombre numerico', data: { nombre: 'Ana2' }, message: 'El nombre solo puede contener letras, espacios y guiones (máximo 50 caracteres).' },
      { name: 'Nombre vacio', data: { nombre: '   ' }, message: 'El nombre es obligatorio.' },
      { name: 'Apellido numerico', data: { apellido1: 'Perez2' }, message: 'El primer apellido solo puede contener letras, espacios y guiones (máximo 50 caracteres).' },
      { name: 'Apellido caracteres', data: { apellido2: 'Lopez@' }, message: 'El segundo apellido solo puede contener letras, espacios y guiones (máximo 50 caracteres).' },
      { name: 'Password sin mayuscula', data: { password: 'abcdefg1' }, message: 'La contraseña no cumple los requisitos de seguridad.' },
      { name: 'Password sin minuscula', data: { password: 'ABCDEFG1' }, message: 'La contraseña no cumple los requisitos de seguridad.' },
      { name: 'Password sin numero', data: { password: 'Abcdefgh' }, message: 'La contraseña no cumple los requisitos de seguridad.' },
      { name: 'Password corto', data: { password: 'Abc1234' }, message: 'La contraseña no cumple los requisitos de seguridad.' },
      { name: 'Password vacio', data: { password: '' }, message: 'La contraseña no cumple los requisitos de seguridad.' },
      { name: 'Comentario largo', data: { comentario: 'a'.repeat(501) }, message: 'Los comentarios no pueden superar los 500 caracteres.' },
    ];
    for (const item of invalidCases) {
      await t.test(`POST ${item.name}: 400 sin usuario, cuenta ni auditoria`, async () => {
        const data = { ...payload(), password: validPassword, ...item.data };
        const email = String(data.email).trim().toLowerCase();
        const beforeUsers = await prisma.usuario.count({ where: { email } });
        const beforeAccounts = await prisma.cuentaAutenticacion.count({ where: { email } });
        const result = await request('POST', '/usuarios', data);
        expectStatus(result, 400); assert.equal(result.body.code, 'VALIDATION_ERROR');
        assert(result.body.errors?.some(issue => issue.message === item.message), JSON.stringify(result.body));
        assert.equal(await prisma.usuario.count({ where: { email } }), beforeUsers);
        assert.equal(await prisma.cuentaAutenticacion.count({ where: { email } }), beforeAccounts);
        assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
      });
    }

    await t.test('PUT parcial normaliza solo campos recibidos; permite borrar codigo con vacio', async () => {
      const { row } = await create({ codUsuario: 'U' + randomUUID().replaceAll('-', '').slice(0, 8), telefono: '612345678' });
      const result = await request('PUT', `/usuarios/${row.id_usuario}`, { nombre: '  Lucía  ', email: ` ${row.email.toUpperCase()} `, telefono: '+34 912 345 678', codUsuario: ' ' });
      expectStatus(result, 200);
      const after = await prisma.usuario.findUniqueOrThrow({ where: { id_usuario: row.id_usuario } });
      assert.deepEqual(after, { ...row, nombre: 'Lucía', email: row.email, telefono: '+34912345678', codUsuario: null, updateAt: after.updateAt });
      expectStatus(await request('PUT', `/usuarios/${row.id_usuario}`, { comentario: ' Solo comentario ' }), 200);
      const last = await prisma.usuario.findUniqueOrThrow({ where: { id_usuario: row.id_usuario } });
      assert.deepEqual(last, { ...after, comentario: 'Solo comentario', updateAt: last.updateAt });
    });
    await t.test('PUT documento usa combinacion final: numero solo, tipo solo y ambos', async () => {
      const { row } = await create({ id_tipo_documento: 1, numeroDocumento: dni() });
      const path = `/usuarios/${row.id_usuario}`;
      for (const data of [{ numeroDocumento: '12345678A' }, { id_tipo_documento: 2 }]) {
        const result = await request('PUT', path, data);
        expectStatus(result, 400); assert.equal(result.body.code, 'VALIDATION_ERROR');
        assert.deepEqual(await prisma.usuario.findUnique({ where: { id_usuario: row.id_usuario } }), row);
        assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
      }
      const nextNie = nie();
      expectStatus(await request('PUT', path, { id_tipo_documento: 2, numeroDocumento: nextNie.toLowerCase() }), 200);
      assert.equal((await prisma.usuario.findUniqueOrThrow({ where: { id_usuario: row.id_usuario } })).numeroDocumento, nextNie);
      const otherNie = nie();
      expectStatus(await request('PUT', path, { numeroDocumento: otherNie.toLowerCase() }), 200);
      expectStatus(await request('PUT', path, { id_tipo_documento: 3 }), 200); // NIE-shaped alphanumeric passport.
      const nextDni = dni();
      expectStatus(await request('PUT', path, { id_tipo_documento: 1, numeroDocumento: nextDni }), 200);
      const after = await prisma.usuario.findUniqueOrThrow({ where: { id_usuario: row.id_usuario } });
      assert.equal(after.numeroDocumento, nextDni); assert.equal(after.id_tipo_documento, 1);
    });
    await t.test('PUT campos invalidos no modifica usuario ni audita exito', async () => {
      const { row } = await create();
      for (const data of [{ email: 'incorrecto' }, { telefono: '12345' }, { codUsuario: 'AB*' }, { nombre: 'Ana3' }, { apellido1: 'A2' }, { comentario: 'x'.repeat(501) }]) {
        const result = await request('PUT', `/usuarios/${row.id_usuario}`, data);
        expectStatus(result, 400);
        assert.deepEqual(await prisma.usuario.findUnique({ where: { id_usuario: row.id_usuario } }), row);
        assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
      }
    });
    await t.test('Datos heredados no se reescriben ni impiden editar un campo independiente', async () => {
      const data = payload();
      const legacy = await prisma.usuario.create({ data: { ...data, id_tipo_documento: 1, numeroDocumento: `TEST-${sequence}` } });
      userIds.push(legacy.id_usuario);
      expectStatus(await request('PUT', `/usuarios/${legacy.id_usuario}`, { telefono: '612345678' }), 200);
      assert.equal((await prisma.usuario.findUniqueOrThrow({ where: { id_usuario: legacy.id_usuario } })).numeroDocumento, legacy.numeroDocumento);
    });
    await t.test('UNIQUE y FK siguen vigentes despues de normalizar', async () => {
      const code = 'U' + randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
      const { row } = await create({ codUsuario: code });
      for (const override of [{ email: row.email.toUpperCase() }, { numeroDocumento: row.numeroDocumento.toLowerCase() }, { codUsuario: code.toLowerCase() }, { id_rol: 2147483647 }]) {
        const result = await request('POST', '/usuarios', { ...payload(), ...override });
        expectStatus(result, 409);
        assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
      }
      const second = await create();
      const result = await request('PUT', `/usuarios/${second.row.id_usuario}`, { email: row.email.toUpperCase(), nombre: 'Cambio rechazado' });
      expectStatus(result, 409);
      assert.deepEqual(await prisma.usuario.findUnique({ where: { id_usuario: second.row.id_usuario } }), second.row);
    });
    await t.test('Autorizacion se mantiene: Usuario no crea; Operador no cambia estado ni rol', async () => {
      expectStatus(await request('POST', '/usuarios', payload(), 'Usuario'), 403);
      const { row } = await create();
      for (const data of [{ id_rol: roleUser.id_rol }, { id_estado_usuario: state.id_estado_usuario }]) {
        expectStatus(await request('PUT', `/usuarios/${row.id_usuario}`, data, 'Operador'), 403);
      }
    });
    await t.test('Fallo de auditoria revierte usuario, cuenta local y auditoria juntos', async st => {
      const data = { ...payload(), password: validPassword };
      const original = prisma.$transaction;
      const transaction = original.bind(prisma);
      let accountInserted = false;
      prisma.$transaction = (async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) => transaction(async tx => {
        const createAudit = tx.auditoria.create;
        tx.auditoria.create = (async (args: Prisma.AuditoriaCreateArgs) => {
          accountInserted = await tx.cuentaAutenticacion.count({ where: { email: data.email } }) === 1;
          await createAudit.call(tx.auditoria, args);
          throw new Error('Fallo de auditoria controlado');
        }) as unknown as typeof tx.auditoria.create;
        try { return await operation(tx); } finally { tx.auditoria.create = createAudit; }
      })) as typeof prisma.$transaction;
      st.mock.method(console, 'error', () => {});
      try {
        const result = await request('POST', '/usuarios', data);
        expectStatus(result, 500); assert(accountInserted);
        assert.equal(await prisma.usuario.count({ where: { email: data.email } }), 0);
        assert.equal(await prisma.cuentaAutenticacion.count({ where: { email: data.email } }), 0);
        assert.equal(await prisma.auditoria.count({ where: { requestId: result.requestId } }), 0);
      } finally { prisma.$transaction = original; }
    });
  } finally {
    const closed = once(server, 'close'); server.close(); server.closeAllConnections(); await closed;
    try {
      await prisma.$transaction(async tx => {
        await tx.auditoria.deleteMany({ where: { requestId: { in: requestIds } } });
        await tx.cuentaAutenticacion.deleteMany({ where: { id_usuario: { in: userIds } } });
        await tx.usuario.deleteMany({ where: { id_usuario: { in: userIds } } });
      });
    } finally { await prisma.$disconnect(); }
  }
});
