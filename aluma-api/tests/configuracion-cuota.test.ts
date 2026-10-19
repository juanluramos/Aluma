import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { Prisma } from '../src/generated/prisma/client.js';
import { prisma } from '../src/config/prisma.js';
import { generateToken } from '../src/utils/jwt.js';
import configuracionCuotaRoutes from '../src/routes/configuracion-cuota/routes.js';
import { requestId } from '../src/middlewares/request-id.middleware.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';

test('CRUD HTTP de la configuración anual de cuotas', async (t) => {
  type Fila = {
    id_configuracion: number;
    anio: number;
    importe: Prisma.Decimal;
    createAt: Date;
    updateAt: Date;
  };
  const filas: Fila[] = [];
  const cuotas: { pagoAnio: number }[] = [];
  const auditorias: { accion: string; recurso: string; id_recurso: number | null; detalles: unknown }[] = [];
  let secuencia = 0;
  let saltarUnico = false;
  let falloAuditoria = false;
  let actualizacionesCuota = 0;

  function duplicado() {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['anio'] },
    });
  }

  function proyectar(fila: Fila, select: Record<string, unknown> | undefined) {
    const completa = {
      ...fila,
      importe: new Prisma.Decimal(fila.importe),
    } as Record<string, unknown>;
    if (!select) return completa;
    return Object.fromEntries(Object.keys(select).filter((clave) => select[clave]).map((clave) => [clave, completa[clave]]));
  }

  const previos = {
    configuracionCuotaAnual: prisma.configuracionCuotaAnual,
    cuota: prisma.cuota,
    usuario: prisma.usuario,
    sesion: prisma.sesionAutenticacion,
    auditoria: prisma.auditoria,
    transaction: prisma.$transaction,
  };

  prisma.configuracionCuotaAnual = {
    async findMany(args: { select?: Record<string, unknown> }) {
      return [...filas]
        .sort((a, b) => b.anio - a.anio || b.id_configuracion - a.id_configuracion)
        .map((fila) => proyectar(fila, args.select));
    },
    async findUnique(args: { where: { anio?: number; id_configuracion?: number }; select?: Record<string, unknown> }) {
      if (args.where.anio !== undefined && saltarUnico) {
        saltarUnico = false;
        return null;
      }
      const fila = filas.find((item) => (
        args.where.id_configuracion !== undefined && item.id_configuracion === args.where.id_configuracion
      ) || (
        args.where.anio !== undefined && item.anio === args.where.anio
      ));
      return fila ? proyectar(fila, args.select) : null;
    },
    async create(args: { data: { anio: number; importe: string }; select?: Record<string, unknown> }) {
      if (filas.some((fila) => fila.anio === args.data.anio)) throw duplicado();
      const ahora = new Date();
      const fila: Fila = {
        id_configuracion: ++secuencia,
        anio: args.data.anio,
        importe: new Prisma.Decimal(args.data.importe),
        createAt: ahora,
        updateAt: ahora,
      };
      filas.push(fila);
      return proyectar(fila, args.select);
    },
    async update(args: { where: { id_configuracion: number }; data: { anio?: number; importe?: string }; select?: Record<string, unknown> }) {
      const fila = filas.find((item) => item.id_configuracion === args.where.id_configuracion);
      if (!fila) throw duplicado();
      const anioAnterior = fila.anio;
      const importeAnterior = new Prisma.Decimal(fila.importe);
      if (args.data.anio !== undefined) fila.anio = args.data.anio;
      if (args.data.importe !== undefined) fila.importe = new Prisma.Decimal(args.data.importe);
      if (filas.some((otra) => otra.id_configuracion !== fila.id_configuracion && otra.anio === fila.anio)) {
        fila.anio = anioAnterior;
        fila.importe = importeAnterior;
        throw duplicado();
      }
      fila.updateAt = new Date();
      return proyectar(fila, args.select);
    },
    async delete(args: { where: { id_configuracion: number }; select?: Record<string, unknown> }) {
      const indice = filas.findIndex((item) => item.id_configuracion === args.where.id_configuracion);
      if (indice < 0) throw duplicado();
      const [fila] = filas.splice(indice, 1);
      return proyectar(fila!, args.select);
    },
  } as typeof prisma.configuracionCuotaAnual;

  prisma.cuota = {
    async count(args: { where?: { pagoAnio?: number } }) {
      const anio = args.where?.pagoAnio;
      return cuotas.filter((fila) => fila.pagoAnio === anio).length;
    },
    async update() {
      actualizacionesCuota += 1;
      return {};
    },
  } as typeof prisma.cuota;

  const roles = new Map<number, 'Usuario' | 'Operador' | 'Administrador'>([
    [2, 'Operador'],
    [3, 'Administrador'],
    [4, 'Usuario'],
  ]);
  prisma.usuario = {
    async findUnique(args: { where: { id_usuario: number } }) {
      const rol = roles.get(args.where.id_usuario);
      if (!rol) return null;
      return { EstadoUsuario: { permiteLogin: true }, RolUsuario: { nombre_rol: rol } };
    },
  } as typeof prisma.usuario;

  prisma.sesionAutenticacion = {
    async findFirst() {
      return { id: 'sesion-de-prueba' };
    },
  } as typeof prisma.sesionAutenticacion;

  prisma.auditoria = {
    async create(args: { data: { accion: string; recurso: string; id_recurso: number | null; detalles: unknown } }) {
      if (falloAuditoria) throw new Error('fallo secreto de auditoria');
      auditorias.push(args.data);
      return { id_auditoria: BigInt(auditorias.length), ...args.data };
    },
  } as typeof prisma.auditoria;

  prisma.$transaction = (async (operacion: (tx: typeof prisma) => Promise<unknown>) => {
    const copia = filas.map((fila) => ({ ...fila, importe: new Prisma.Decimal(fila.importe), createAt: new Date(fila.createAt), updateAt: new Date(fila.updateAt) }));
    const copiaAuditorias = auditorias.map((item) => ({ ...item }));
    try {
      return await operacion(prisma);
    } catch (error) {
      filas.splice(0, filas.length, ...copia);
      auditorias.splice(0, auditorias.length, ...copiaAuditorias);
      throw error;
    }
  }) as typeof prisma.$transaction;

  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/configuracion-cuotas', configuracionCuotaRoutes);
  app.use(errorMiddleware);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api/configuracion-cuotas`;

  function token(id: number, rol: 'Usuario' | 'Operador' | 'Administrador') {
    return generateToken({ sid: randomUUID(), id_usuario: id, rol });
  }
  const operador = token(2, 'Operador');
  const administrador = token(3, 'Administrador');
  const usuario = token(4, 'Usuario');

  async function llamar(method: string, path: string, body?: unknown, credencial?: string) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(credencial && { Authorization: `Bearer ${credencial}` }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const texto = await response.text();
    return { status: response.status, body: texto ? JSON.parse(texto) as Record<string, unknown> : null, texto };
  }

  try {
    await t.test('sin credencial responde 401', async () => {
      assert.equal((await llamar('GET', '')).status, 401);
      assert.equal((await llamar('POST', '', { anio: 2026, importe: 30 })).status, 401);
    });

    await t.test('Administrador crea una configuración válida', async () => {
      const resultado = await llamar('POST', '', { anio: 2026, importe: 30 }, administrador);
      assert.equal(resultado.status, 201);
      assert.equal(resultado.body?.anio, 2026);
      assert.equal(resultado.body?.importe, '30.00');
      const auditoria = auditorias.at(-1);
      assert.equal(auditoria?.accion, 'CONFIGURACION_CUOTA_CREADA');
      assert.equal(auditoria?.recurso, 'CONFIGURACION_CUOTA');
      assert.deepEqual(auditoria?.detalles, { anio: 2026, importe: '30.00' });
    });

    await t.test('Administrador consulta y Operador no puede ver ni modificar', async () => {
      const listado = await llamar('GET', '', undefined, administrador);
      assert.equal(listado.status, 200);
      assert.equal(Array.isArray(listado.body) && listado.body.length, 1);
      const id = filas[0]!.id_configuracion;
      assert.equal((await llamar('GET', `/${id}`, undefined, administrador)).status, 200);
      for (const [method, path, body] of [
        ['GET', '', undefined],
        ['GET', `/${id}`, undefined],
        ['POST', '', { anio: 2027, importe: 35 }],
        ['PUT', `/${id}`, { importe: 40 }],
        ['DELETE', `/${id}`, undefined],
      ] as const) {
        const resultado = await llamar(method, path, body, operador);
        assert.equal(resultado.status, 403, `${method} ${path}`);
        assert.equal(resultado.body?.code, 'FORBIDDEN');
      }
      assert.equal(filas.length, 1);
      assert.equal(filas[0]?.importe.toFixed(2), '30.00');
    });

    await t.test('Usuario normal no consulta ni modifica', async () => {
      for (const [method, path, body] of [
        ['GET', '', undefined],
        ['GET', '/1', undefined],
        ['POST', '', { anio: 2027, importe: 35 }],
        ['PUT', '/1', { importe: 40 }],
        ['DELETE', '/1', undefined],
      ] as const) {
        const resultado = await llamar(method, path, body, usuario);
        assert.equal(resultado.status, 403, `${method} ${path}`);
        assert.equal(resultado.body?.code, 'FORBIDDEN');
      }
    });

    await t.test('el año duplicado responde 409 sin detalles de Prisma', async () => {
      const resultado = await llamar('POST', '', { anio: 2026, importe: 40 }, administrador);
      assert.equal(resultado.status, 409);
      assert.equal(resultado.body?.code, 'CONFIGURACION_CUOTA_DUPLICADA');
      assert.equal(resultado.body?.message, 'No puede existir más de una configuración para el mismo año.');
      assert.equal(JSON.stringify(resultado.body).includes('P2002'), false);
      assert.equal(JSON.stringify(resultado.body).includes('Prisma'), false);
      assert.equal(filas.length, 1);
    });

    await t.test('año inválido, importe cero, negativo o con más de dos decimales', async () => {
      assert.equal((await llamar('POST', '', { anio: 1969, importe: 30 }, administrador)).status, 400);
      assert.equal((await llamar('POST', '', { anio: 2027, importe: 0 }, administrador)).status, 400);
      assert.equal((await llamar('POST', '', { anio: 2027, importe: -1 }, administrador)).status, 400);
      assert.equal((await llamar('POST', '', { anio: 2027, importe: 10.555 }, administrador)).status, 400);
      assert.equal((await llamar('POST', '', { anio: 2027, importe: 'treinta' }, administrador)).status, 400);
      assert.equal(filas.length, 1);
    });

    await t.test('editar el importe no toca las cuotas ya registradas', async () => {
      cuotas.push({ pagoAnio: 2026 });
      const id = filas[0]!.id_configuracion;
      const antes = actualizacionesCuota;
      const resultado = await llamar('PUT', `/${id}`, { importe: 35 }, administrador);
      assert.equal(resultado.status, 200);
      assert.equal(resultado.body?.importe, '35.00');
      assert.equal(resultado.body?.anio, 2026);
      assert.equal(filas[0]?.importe.toFixed(2), '35.00');
      assert.equal(actualizacionesCuota, antes);
      assert.equal(auditorias.at(-1)?.accion, 'CONFIGURACION_CUOTA_MODIFICADA');
      const detalles = auditorias.at(-1)?.detalles as { cambios?: { importe?: { anterior: string; nuevo: string } } };
      assert.deepEqual(detalles.cambios?.importe, { anterior: '30.00', nuevo: '35.00' });
    });

    await t.test('editar el año a uno ocupado responde 409 y conserva el año', async () => {
      const segunda = await llamar('POST', '', { anio: 2027, importe: 40 }, administrador);
      assert.equal(segunda.status, 201);
      const id = filas.find((fila) => fila.anio === 2027)!.id_configuracion;
      const resultado = await llamar('PUT', `/${id}`, { anio: 2026 }, administrador);
      assert.equal(resultado.status, 409);
      assert.equal(resultado.body?.code, 'CONFIGURACION_CUOTA_DUPLICADA');
      assert.equal(filas.find((fila) => fila.id_configuracion === id)?.anio, 2027);
    });

    await t.test('un conflicto unique que llega desde la base también es 409', async () => {
      saltarUnico = true;
      const id = filas.find((fila) => fila.anio === 2027)!.id_configuracion;
      const antes = auditorias.length;
      const resultado = await llamar('PUT', `/${id}`, { anio: 2026 }, administrador);
      saltarUnico = false;
      assert.equal(resultado.status, 409);
      assert.equal(resultado.body?.code, 'CONFIGURACION_CUOTA_DUPLICADA');
      assert.equal(auditorias.length, antes);
      assert.equal(filas.find((fila) => fila.id_configuracion === id)?.anio, 2027);
    });

    await t.test('borrar una configuración usada por cuotas responde 409', async () => {
      const usada = filas.find((fila) => fila.anio === 2026)!;
      const resultado = await llamar('DELETE', `/${usada.id_configuracion}`, undefined, administrador);
      assert.equal(resultado.status, 409);
      assert.equal(resultado.body?.code, 'CONFIGURACION_CUOTA_EN_USO');
      assert.equal(resultado.body?.message, 'No se puede eliminar la configuración porque existen cuotas registradas para ese año.');
      assert.equal(filas.some((fila) => fila.id_configuracion === usada.id_configuracion), true);
    });

    await t.test('borrar una configuración sin cuotas responde 204', async () => {
      const libre = filas.find((fila) => fila.anio === 2027)!;
      const resultado = await llamar('DELETE', `/${libre.id_configuracion}`, undefined, administrador);
      assert.equal(resultado.status, 204);
      assert.equal(resultado.texto, '');
      assert.equal(filas.some((fila) => fila.id_configuracion === libre.id_configuracion), false);
      assert.equal(auditorias.at(-1)?.accion, 'CONFIGURACION_CUOTA_ELIMINADA');
      assert.equal((await llamar('DELETE', `/${libre.id_configuracion}`, undefined, administrador)).status, 404);
    });

    await t.test('si falla la auditoría no queda la configuración creada', async () => {
      const antes = filas.length;
      const auditoriasAntes = auditorias.length;
      falloAuditoria = true;
      const resultado = await llamar('POST', '', { anio: 2028, importe: 50 }, administrador);
      falloAuditoria = false;
      assert.equal(resultado.status, 500);
      assert.equal(resultado.texto.includes('fallo secreto'), false);
      assert.equal(filas.length, antes);
      assert.equal(filas.some((fila) => fila.anio === 2028), false);
      assert.equal(auditorias.length, auditoriasAntes);
    });
  } finally {
    prisma.configuracionCuotaAnual = previos.configuracionCuotaAnual;
    prisma.cuota = previos.cuota;
    prisma.usuario = previos.usuario;
    prisma.sesionAutenticacion = previos.sesion;
    prisma.auditoria = previos.auditoria;
    prisma.$transaction = previos.transaction;
    const cerrado = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await cerrado;
  }
});
