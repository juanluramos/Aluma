import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { Prisma } from '../src/generated/prisma/client.js';
import { prisma } from '../src/config/prisma.js';
import { generateToken } from '../src/utils/jwt.js';
import { fechaDesdeCalendario, fechaHoyCalendario } from '../src/utils/fechaCalendario.js';
import cuotaRoutes from '../src/routes/cuota/routes.js';
import { requestId } from '../src/middlewares/request-id.middleware.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';

test('CRUD HTTP de cuotas con permisos, fecha de base de datos y conflicto de año', async (t) => {
  type Rol = 'Usuario' | 'Operador' | 'Administrador';
  type Fila = {
    id_cuota: number;
    id_usuario: number;
    pagoAnio: number;
    fechaPago: Date;
    importePagado: Prisma.Decimal;
    comentario: string | null;
    createAt: Date;
    updateAt: Date;
  };
  const filas: Fila[] = [];
  const auditorias: { accion: string; recurso: string; id_recurso: number | null; detalles: unknown }[] = [];
  const usuarios = new Map<number, { id_usuario: number; codUsuario: string | null; nombre: string; apellido1: string | null; apellido2: string | null; rol: Rol; socio: boolean }>([
    [2, { id_usuario: 2, codUsuario: 'ALU02', nombre: 'Ana', apellido1: 'Operador', apellido2: null, rol: 'Operador', socio: false }],
    [3, { id_usuario: 3, codUsuario: 'ALU03', nombre: 'Luis', apellido1: 'Admin', apellido2: null, rol: 'Administrador', socio: false }],
    [4, { id_usuario: 4, codUsuario: 'ALU04', nombre: 'Pedro', apellido1: 'Socio', apellido2: null, rol: 'Usuario', socio: false }],
    [10, { id_usuario: 10, codUsuario: 'ALU10', nombre: 'Nuria', apellido1: 'Uno', apellido2: null, rol: 'Usuario', socio: false }],
    [15, { id_usuario: 15, codUsuario: 'ALU15', nombre: 'Marta', apellido1: 'García', apellido2: 'López', rol: 'Usuario', socio: false }],
    [20, { id_usuario: 20, codUsuario: 'ALU20', nombre: 'Hugo', apellido1: 'Dos', apellido2: null, rol: 'Usuario', socio: false }],
    [30, { id_usuario: 30, codUsuario: 'ALU30', nombre: 'Irene', apellido1: 'Tres', apellido2: null, rol: 'Usuario', socio: false }],
    [31, { id_usuario: 31, codUsuario: 'ALU31', nombre: 'Omar', apellido1: 'Cuatro', apellido2: null, rol: 'Usuario', socio: false }],
    [32, { id_usuario: 32, codUsuario: 'ALU32', nombre: 'Lara', apellido1: 'Cinco', apellido2: null, rol: 'Usuario', socio: false }],
  ]);
  type InscripcionPrecio = {
    id_inscripcion: number;
    id_usuario: number;
    precioAplicado: Prisma.Decimal;
    estadoInscripcion: string;
    estadoPago: string;
    importeSocio: Prisma.Decimal;
    importeNoSocio: Prisma.Decimal;
  };
  const inscripciones: InscripcionPrecio[] = [];
  let secuencia = 0;
  let secuenciaConfiguracion = 0;
  type Configuracion = {
    id_configuracion: number;
    anio: number;
    importe: Prisma.Decimal;
    createAt: Date;
    updateAt: Date;
  };
  const configuraciones: Configuracion[] = [];
  function sembrarConfiguracion(anio: number, importe = '30.00') {
    const existente = configuraciones.find((fila) => fila.anio === anio);
    if (existente) {
      existente.importe = new Prisma.Decimal(importe);
      return existente;
    }
    const ahora = new Date();
    const fila: Configuracion = {
      id_configuracion: ++secuenciaConfiguracion,
      anio,
      importe: new Prisma.Decimal(importe),
      createAt: ahora,
      updateAt: ahora,
    };
    configuraciones.push(fila);
    return fila;
  }
  for (const anio of [2024, 2025, 2026, 2027, new Date().getFullYear(), new Date().getFullYear() - 1]) {
    sembrarConfiguracion(anio);
  }
  let saltarUnico = false;
  let falloInterno = false;
  let falloSocio = false;
  let falloRecalculo = false;
  let lecturasPrecio = 0;
  let ultimaCreacion: Record<string, unknown> | null = null;
  let ultimaActualizacion: Record<string, unknown> | null = null;

  function duplicado() {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['id_usuario', 'pagoAnio'] },
    });
  }

  function forma(fila: Fila) {
    const persona = usuarios.get(fila.id_usuario);
    return {
      ...fila,
      Usuario: persona
        ? { id_usuario: persona.id_usuario, codUsuario: persona.codUsuario, nombre: persona.nombre, apellido1: persona.apellido1, apellido2: persona.apellido2 }
        : null,
    };
  }

  function proyectar(fila: Fila, select: Record<string, unknown> | undefined) {
    const completa = forma(fila) as Record<string, unknown>;
    if (!select) return completa;
    return Object.fromEntries(Object.keys(select).filter((clave) => select[clave]).map((clave) => [clave, completa[clave]]));
  }

  const previos = {
    cuota: prisma.cuota,
    configuracionCuotaAnual: prisma.configuracionCuotaAnual,
    usuario: prisma.usuario,
    sesion: prisma.sesionAutenticacion,
    auditoria: prisma.auditoria,
    inscripcion: prisma.inscripcionActividad,
    transaction: prisma.$transaction,
  };

  prisma.cuota = {
    async findMany(args: { where?: { id_usuario?: number }; select?: Record<string, unknown> }) {
      if (falloInterno) throw new Error('motor-secreto de prisma');
      return filas
        .filter((fila) => args.where?.id_usuario === undefined || fila.id_usuario === args.where.id_usuario)
        .sort((a, b) => b.pagoAnio - a.pagoAnio || b.id_cuota - a.id_cuota)
        .map((fila) => proyectar(fila, args.select));
    },
    async findUnique(args: { where: { id_cuota?: number; id_usuario_pagoAnio?: { id_usuario: number; pagoAnio: number } }; select?: Record<string, unknown> }) {
      if (args.where.id_usuario_pagoAnio) {
        if (saltarUnico) {
          saltarUnico = false;
          return null;
        }
        const buscada = args.where.id_usuario_pagoAnio;
        const fila = filas.find((item) => item.id_usuario === buscada.id_usuario && item.pagoAnio === buscada.pagoAnio);
        return fila ? proyectar(fila, args.select) : null;
      }
      const fila = filas.find((item) => item.id_cuota === args.where.id_cuota);
      return fila ? proyectar(fila, args.select) : null;
    },
    async create(args: { data: Record<string, unknown>; select?: Record<string, unknown> }) {
      ultimaCreacion = args.data;
      const idUsuario = args.data.id_usuario as number;
      const pagoAnio = args.data.pagoAnio as number;
      if (filas.some((fila) => fila.id_usuario === idUsuario && fila.pagoAnio === pagoAnio)) throw duplicado();
      const ahora = new Date();
      const fila: Fila = {
        id_cuota: ++secuencia,
        id_usuario: idUsuario,
        pagoAnio,
        fechaPago: (args.data.fechaPago as Date | undefined) ?? fechaDesdeCalendario(fechaHoyCalendario()),
        importePagado: new Prisma.Decimal(args.data.importePagado as Prisma.Decimal.Value),
        comentario: (args.data.comentario as string | null | undefined) ?? null,
        createAt: ahora,
        updateAt: ahora,
      };
      filas.push(fila);
      return proyectar(fila, args.select);
    },
    async update(args: { where: { id_cuota: number }; data: Record<string, unknown>; select?: Record<string, unknown> }) {
      ultimaActualizacion = args.data;
      const fila = filas.find((item) => item.id_cuota === args.where.id_cuota);
      if (!fila) throw duplicado();
      if (args.data.id_usuario !== undefined) fila.id_usuario = args.data.id_usuario as number;
      if (args.data.pagoAnio !== undefined) fila.pagoAnio = args.data.pagoAnio as number;
      if (args.data.fechaPago !== undefined) fila.fechaPago = args.data.fechaPago as Date;
      if (args.data.importePagado !== undefined) fila.importePagado = new Prisma.Decimal(args.data.importePagado as Prisma.Decimal.Value);
      if (args.data.comentario !== undefined) fila.comentario = args.data.comentario as string | null;
      if (filas.some((otra) => otra.id_cuota !== fila.id_cuota && otra.id_usuario === fila.id_usuario && otra.pagoAnio === fila.pagoAnio)) {
        throw duplicado();
      }
      fila.updateAt = new Date();
      return proyectar(fila, args.select);
    },
    async delete(args: { where: { id_cuota: number }; select?: Record<string, unknown> }) {
      const indice = filas.findIndex((item) => item.id_cuota === args.where.id_cuota);
      if (indice < 0) throw duplicado();
      const [fila] = filas.splice(indice, 1);
      return proyectar(fila!, args.select);
    },
  } as typeof prisma.cuota;

  prisma.configuracionCuotaAnual = {
    async findUnique(args: { where: { anio?: number; id_configuracion?: number }; select?: Record<string, unknown> }) {
      const fila = configuraciones.find((item) => (
        args.where.anio !== undefined && item.anio === args.where.anio
      ) || (
        args.where.id_configuracion !== undefined && item.id_configuracion === args.where.id_configuracion
      ));
      if (!fila) return null;
      const completa = { ...fila, importe: new Prisma.Decimal(fila.importe) } as Record<string, unknown>;
      if (!args.select) return completa;
      return Object.fromEntries(Object.keys(args.select).filter((clave) => args.select?.[clave]).map((clave) => [clave, completa[clave]]));
    },
  } as typeof prisma.configuracionCuotaAnual;

  prisma.usuario = {
    async findUnique(args: { where: { id_usuario: number }; select?: { EstadoUsuario?: unknown } }) {
      const persona = usuarios.get(args.where.id_usuario);
      if (!persona) return null;
      if (args.select?.EstadoUsuario) {
        return { EstadoUsuario: { permiteLogin: true }, RolUsuario: { nombre_rol: persona.rol } };
      }
      return {
        id_usuario: persona.id_usuario,
        ...(args.select?.socio ? { socio: persona.socio } : {}),
      };
    },
    async update(args: { where: { id_usuario: number }; data: { socio?: boolean } }) {
      if (falloSocio) throw new Error('fallo al guardar socio');
      const persona = usuarios.get(args.where.id_usuario);
      if (!persona) throw new Error('usuario ausente');
      if (args.data.socio !== undefined) persona.socio = args.data.socio;
      return { id_usuario: persona.id_usuario, socio: persona.socio };
    },
  } as typeof prisma.usuario;

  prisma.sesionAutenticacion = {
    async findFirst() {
      return { id: 'sesion-de-prueba' };
    },
  } as typeof prisma.sesionAutenticacion;

  prisma.auditoria = {
    async create(args: { data: { accion: string; recurso: string; id_recurso: number | null; detalles: unknown } }) {
      auditorias.push(args.data);
      return { id_auditoria: BigInt(auditorias.length), ...args.data };
    },
  } as typeof prisma.auditoria;

  prisma.inscripcionActividad = {
    async findMany(args: { where?: { id_usuario?: number } }) {
      lecturasPrecio += 1;
      const idUsuario = args.where?.id_usuario;
      return inscripciones
        .filter((fila) => fila.id_usuario === idUsuario)
        .map((fila) => ({
          id_inscripcion: fila.id_inscripcion,
          precioAplicado: fila.precioAplicado,
          EstadoPago: { nombre_estado: fila.estadoPago },
          EstadoInscripcion: { nombre: fila.estadoInscripcion },
          Actividad: { importeSocio: fila.importeSocio, importeNoSocio: fila.importeNoSocio },
        }));
    },
    async update(args: { where: { id_inscripcion: number }; data: { precioAplicado: Prisma.Decimal } }) {
      const fila = inscripciones.find((item) => item.id_inscripcion === args.where.id_inscripcion);
      if (!fila) throw new Error('inscripcion ausente');
      fila.precioAplicado = args.data.precioAplicado;
      if (falloRecalculo) throw new Error('fallo al recalcular precios');
      return { id_inscripcion: fila.id_inscripcion, precioAplicado: fila.precioAplicado };
    },
  } as typeof prisma.inscripcionActividad;

  prisma.$transaction = (async (operacion: (tx: typeof prisma) => Promise<unknown>) => {
    const copiaFilas = filas.map((fila) => ({
      ...fila,
      fechaPago: new Date(fila.fechaPago),
      importePagado: new Prisma.Decimal(fila.importePagado),
      createAt: new Date(fila.createAt),
      updateAt: new Date(fila.updateAt),
    }));
    const copiaConfiguraciones = configuraciones.map((fila) => ({
      ...fila,
      importe: new Prisma.Decimal(fila.importe),
      createAt: new Date(fila.createAt),
      updateAt: new Date(fila.updateAt),
    }));
    const socios = new Map([...usuarios].map(([id, persona]) => [id, persona.socio]));
    const copiaAuditorias = auditorias.map((item) => ({ ...item }));
    const copiaInscripciones = inscripciones.map((fila) => ({
      ...fila,
      precioAplicado: new Prisma.Decimal(fila.precioAplicado),
      importeSocio: new Prisma.Decimal(fila.importeSocio),
      importeNoSocio: new Prisma.Decimal(fila.importeNoSocio),
    }));
    try {
      return await operacion(prisma);
    } catch (error) {
      filas.splice(0, filas.length, ...copiaFilas);
      configuraciones.splice(0, configuraciones.length, ...copiaConfiguraciones);
      auditorias.splice(0, auditorias.length, ...copiaAuditorias);
      inscripciones.splice(0, inscripciones.length, ...copiaInscripciones);
      for (const [id, socio] of socios) {
        const persona = usuarios.get(id);
        if (persona) persona.socio = socio;
      }
      throw error;
    }
  }) as typeof prisma.$transaction;

  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/cuotas', cuotaRoutes);
  app.use(errorMiddleware);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api/cuotas`;

  function token(id: number, rol: Rol) {
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
      assert.equal((await llamar('POST', '', { id_usuario: 15, pagoAnio: 2026 })).status, 401);
    });

    await t.test('Operador crea sin fecha y MariaDB aporta el día actual', async () => {
      const resultado = await llamar('POST', '', { id_usuario: 15, pagoAnio: 2026, comentario: 'Pagado por transferencia' }, operador);
      assert.equal(resultado.status, 201);
      assert.equal(resultado.body?.fechaPago, fechaHoyCalendario());
      assert.equal(Object.hasOwn(ultimaCreacion ?? {}, 'fechaPago'), false);
      assert.equal(resultado.body?.comentario, 'Pagado por transferencia');
      assert.deepEqual(resultado.body?.Usuario, { id_usuario: 15, codUsuario: 'ALU15', nombre: 'Marta', apellido1: 'García', apellido2: 'López' });
      const creada = [...auditorias].reverse().find((item) => item.accion === 'CUOTA_CREADA');
      assert.equal(creada?.recurso, 'CUOTA');
      assert.equal(JSON.stringify(creada?.detalles ?? null).includes('Pagado'), false);
    });

    await t.test('Administrador crea con fecha explícita', async () => {
      const resultado = await llamar('POST', '', {
        id_usuario: 15, pagoAnio: 2025, fechaPago: '2025-03-14', comentario: 'Cuota atrasada',
      }, administrador);
      assert.equal(resultado.status, 201);
      assert.equal(resultado.body?.fechaPago, '2025-03-14');
      assert.equal(resultado.body?.pagoAnio, 2025);
    });

    await t.test('un comentario con comillas y símbolos se conserva', async () => {
      const comentario = 'Pagó "transferencia" 50€';
      const resultado = await llamar('POST', '', { id_usuario: 15, pagoAnio: 2024, comentario: `  ${comentario}  ` }, operador);
      assert.equal(resultado.status, 201);
      assert.equal(resultado.body?.comentario, comentario);
    });

    await t.test('Usuario normal no crea, lista, edita ni elimina', async () => {
      for (const [method, path, body] of [
        ['GET', '', undefined],
        ['GET', '/1', undefined],
        ['GET', '/usuario/15', undefined],
        ['POST', '', { id_usuario: 15, pagoAnio: 2026 }],
        ['PUT', '/1', { comentario: 'no' }],
        ['DELETE', '/1', undefined],
      ] as const) {
        const resultado = await llamar(method, path, body, usuario);
        assert.equal(resultado.status, 403, `${method} ${path}`);
        assert.equal(resultado.body?.code, 'FORBIDDEN');
      }
      assert.equal(filas.length, 3);
    });

    await t.test('usuario inexistente, año, fecha y comentario inválidos', async () => {
      assert.equal((await llamar('POST', '', { id_usuario: 999, pagoAnio: 2023 }, operador)).status, 404);
      assert.equal((await llamar('POST', '', { id_usuario: 15, pagoAnio: 2026.5 }, operador)).status, 400);
      assert.equal((await llamar('POST', '', { id_usuario: 15, pagoAnio: '2026' }, operador)).status, 400);
      assert.equal((await llamar('POST', '', { id_usuario: 15, pagoAnio: 1969 }, operador)).status, 400);
      assert.equal((await llamar('POST', '', { id_usuario: 15, pagoAnio: 2023, fechaPago: '2023-02-31' }, operador)).status, 400);
      assert.equal((await llamar('POST', '', { id_usuario: 15, pagoAnio: 2023, comentario: 'a'.repeat(501) }, operador)).status, 400);
      assert.equal((await llamar('POST', '', { id_usuario: 15, pagoAnio: 2023, comentario: 'nota\u0000' }, operador)).status, 400);
      assert.equal(filas.length, 3);
    });

    await t.test('la segunda cuota del mismo usuario y año es 409 sin error de Prisma', async () => {
      const resultado = await llamar('POST', '', { id_usuario: 15, pagoAnio: 2026 }, operador);
      assert.equal(resultado.status, 409);
      assert.equal(resultado.body?.code, 'CUOTA_DUPLICADA');
      assert.equal(resultado.body?.message, 'Este usuario ya tiene una cuota registrada para ese año.');
      assert.equal(JSON.stringify(resultado.body).includes('Prisma'), false);
      assert.equal(JSON.stringify(resultado.body).includes('P2002'), false);
    });

    await t.test('un conflicto unique que llega desde la base también es 409', async () => {
      saltarUnico = true;
      const antes = auditorias.length;
      const resultado = await llamar('POST', '', { id_usuario: 15, pagoAnio: 2026 }, administrador);
      assert.equal(resultado.status, 409);
      assert.equal(resultado.body?.code, 'CUOTA_DUPLICADA');
      assert.equal(auditorias.length, antes);
      assert.equal(filas.filter((fila) => fila.pagoAnio === 2026).length, 1);
    });

    await t.test('listar, obtener por id y por usuario', async () => {
      const listado = await llamar('GET', '', undefined, operador);
      assert.equal(listado.status, 200);
      assert.equal(Array.isArray(listado.body) && listado.body.length, 3);
      const propia = await llamar('POST', '', { id_usuario: 3, pagoAnio: 2026, comentario: 'Cuota del administrador' }, administrador);
      assert.equal(propia.status, 201);
      const delUsuario = await llamar('GET', '/usuario/15', undefined, operador);
      assert.equal(delUsuario.status, 200);
      const anios = (delUsuario.body as { pagoAnio: number }[]).map((fila) => fila.pagoAnio);
      assert.deepEqual(anios, [2026, 2025, 2024]);
      const primera = filas.find((fila) => fila.id_usuario === 15 && fila.pagoAnio === 2026)!;
      const una = await llamar('GET', `/${primera.id_cuota}`, undefined, administrador);
      assert.equal(una.status, 200);
      assert.equal(una.body?.id_cuota, primera.id_cuota);
      assert.equal((await llamar('GET', '/99999', undefined, operador)).status, 404);
      assert.equal((await llamar('GET', '/usuario/999', undefined, operador)).status, 404);
      assert.equal((await llamar('GET', '/abc', undefined, operador)).status, 400);
      assert.equal((await llamar('GET', '/usuario/0', undefined, operador)).status, 400);
    });

    await t.test('la actualización parcial conserva lo no enviado y rechaza duplicados', async () => {
      const cuota = filas.find((fila) => fila.id_usuario === 15 && fila.pagoAnio === 2026)!;
      const fechaInicial = cuota.fechaPago;
      const comentario = await llamar('PUT', `/${cuota.id_cuota}`, { comentario: '  Nota privada Ñ  ' }, operador);
      assert.equal(comentario.status, 200);
      assert.equal(comentario.body?.comentario, 'Nota privada Ñ');
      assert.equal(comentario.body?.pagoAnio, 2026);
      assert.deepEqual(Object.keys(ultimaActualizacion ?? {}), ['comentario']);
      const auditoria = auditorias.at(-1);
      assert.equal(auditoria?.accion, 'CUOTA_MODIFICADA');
      assert.equal(JSON.stringify(auditoria?.detalles).includes('Nota privada'), false);
      assert.equal(JSON.stringify(auditoria?.detalles).includes('[REDACTADO]'), true);

      const fecha = await llamar('PUT', `/${cuota.id_cuota}`, { fechaPago: '2026-02-20' }, administrador);
      assert.equal(fecha.status, 200);
      assert.equal(fecha.body?.fechaPago, '2026-02-20');
      assert.equal(fecha.body?.comentario, 'Nota privada Ñ');
      assert.notEqual(cuota.fechaPago.getTime(), fechaInicial.getTime());

      const atrasada = filas.find((fila) => fila.id_usuario === 15 && fila.pagoAnio === 2025)!;
      const anio = await llamar('PUT', `/${atrasada.id_cuota}`, { pagoAnio: 2027 }, operador);
      assert.equal(anio.status, 200);
      assert.equal(anio.body?.pagoAnio, 2027);
      assert.equal(anio.body?.fechaPago, '2025-03-14');
      assert.equal(anio.body?.comentario, 'Cuota atrasada');

      const conflicto = await llamar('PUT', `/${atrasada.id_cuota}`, { pagoAnio: 2026 }, operador);
      assert.equal(conflicto.status, 409);
      assert.equal(conflicto.body?.code, 'CUOTA_DUPLICADA');
      assert.equal(atrasada.pagoAnio, 2027);

      assert.equal((await llamar('PUT', `/${cuota.id_cuota}`, { fechaPago: '2026-13-40' }, operador)).status, 400);
      assert.equal((await llamar('PUT', `/${cuota.id_cuota}`, { comentario: `mal\u0007` }, operador)).status, 400);
      assert.equal(cuota.comentario, 'Nota privada Ñ');
      assert.equal(cuota.fechaPago.toISOString().slice(0, 10), '2026-02-20');
    });

    await t.test('eliminar solo la cuota indicada', async () => {
      const objetivo = filas.find((fila) => fila.pagoAnio === 2027)!;
      const restantes = filas.length;
      const borrada = await llamar('DELETE', `/${objetivo.id_cuota}`, undefined, administrador);
      assert.equal(borrada.status, 204);
      assert.equal(borrada.texto, '');
      assert.equal(filas.length, restantes - 1);
      assert.equal(filas.some((fila) => fila.id_cuota === objetivo.id_cuota), false);
      assert.equal(auditorias.at(-1)?.accion, 'CUOTA_ELIMINADA');
      assert.equal((await llamar('GET', `/${objetivo.id_cuota}`, undefined, operador)).status, 404);
      assert.equal((await llamar('DELETE', `/${objetivo.id_cuota}`, undefined, operador)).status, 404);
      assert.equal((await llamar('DELETE', '/1', undefined, usuario)).status, 403);
      assert.equal(usuarios.get(15)?.rol, 'Usuario');
    });

    await t.test('la cuota del año actual activa socio y la de otro año no lo toca', async () => {
      const anio = new Date().getFullYear();
      assert.equal(usuarios.get(10)?.socio, false);
      const actual = await llamar('POST', '', { id_usuario: 10, pagoAnio: anio }, operador);
      assert.equal(actual.status, 201);
      assert.equal(usuarios.get(10)?.socio, true);
      const auditoria = [...auditorias].reverse().find((item) => item.accion === 'USUARIO_MODIFICADO' && item.id_recurso === 10);
      assert.equal(auditoria?.recurso, 'USUARIO');
      const detalles = auditoria?.detalles as { origen?: string; id_cuota?: number; cambios?: { socio?: { anterior: boolean; nuevo: boolean } } };
      assert.equal(detalles.origen, 'CUOTA');
      assert.equal(detalles.id_cuota, actual.body?.id_cuota);
      assert.deepEqual(detalles.cambios?.socio, { anterior: false, nuevo: true });

      const antes = usuarios.get(20)?.socio;
      const pasada = await llamar('POST', '', { id_usuario: 20, pagoAnio: anio - 1 }, administrador);
      assert.equal(pasada.status, 201);
      assert.equal(usuarios.get(20)?.socio, antes);
    });

    await t.test('borrar la cuota del año actual desactiva socio y la de otro año no', async () => {
      const anio = new Date().getFullYear();
      const actual = filas.find((fila) => fila.id_usuario === 10 && fila.pagoAnio === anio)!;
      const borrada = await llamar('DELETE', `/${actual.id_cuota}`, undefined, operador);
      assert.equal(borrada.status, 204);
      assert.equal(usuarios.get(10)?.socio, false);

      usuarios.get(20)!.socio = true;
      const pasada = filas.find((fila) => fila.id_usuario === 20 && fila.pagoAnio === anio - 1)!;
      const otra = await llamar('DELETE', `/${pasada.id_cuota}`, undefined, administrador);
      assert.equal(otra.status, 204);
      assert.equal(usuarios.get(20)?.socio, true);
    });

    await t.test('editar año o usuario recalcula solo a quien entra o sale del año actual', async () => {
      const anio = new Date().getFullYear();
      const alta = await llamar('POST', '', { id_usuario: 10, pagoAnio: anio }, operador);
      assert.equal(alta.status, 201);
      assert.equal(usuarios.get(10)?.socio, true);
      const id = alta.body?.id_cuota as number;

      const sale = await llamar('PUT', `/${id}`, { pagoAnio: anio - 1 }, operador);
      assert.equal(sale.status, 200);
      assert.equal(usuarios.get(10)?.socio, false);

      const entra = await llamar('PUT', `/${id}`, { pagoAnio: anio }, administrador);
      assert.equal(entra.status, 200);
      assert.equal(usuarios.get(10)?.socio, true);

      const traslado = await llamar('PUT', `/${id}`, { id_usuario: 20 }, operador);
      assert.equal(traslado.status, 200);
      assert.equal(usuarios.get(10)?.socio, false);
      assert.equal(usuarios.get(20)?.socio, true);

      const devuelta = await llamar('PUT', `/${id}`, { id_usuario: 10, pagoAnio: anio - 1 }, operador);
      assert.equal(devuelta.status, 200);
      assert.equal(usuarios.get(10)?.socio, false);
      usuarios.get(20)!.socio = false;
      const cruza = await llamar('PUT', `/${id}`, { id_usuario: 20, pagoAnio: anio }, administrador);
      assert.equal(cruza.status, 200);
      assert.equal(usuarios.get(10)?.socio, false);
      assert.equal(usuarios.get(20)?.socio, true);

      const socioAntes = usuarios.get(20)?.socio;
      const comentario = await llamar('PUT', `/${id}`, { comentario: 'Solo una nota' }, operador);
      assert.equal(comentario.status, 200);
      assert.equal(usuarios.get(20)?.socio, socioAntes);
      const fecha = await llamar('PUT', `/${id}`, { fechaPago: `${anio}-04-02` }, operador);
      assert.equal(fecha.status, 200);
      assert.equal(usuarios.get(20)?.socio, socioAntes);
    });

    await t.test('un cambio manual de socio se conserva al consultar', async () => {
      const anio = new Date().getFullYear();
      assert.equal(usuarios.get(20)?.socio, true);
      usuarios.get(20)!.socio = false;
      const auditoriasAntes = auditorias.length;
      assert.equal((await llamar('GET', '', undefined, operador)).status, 200);
      assert.equal((await llamar('GET', '/usuario/20', undefined, administrador)).status, 200);
      const cuota = filas.find((fila) => fila.id_usuario === 20 && fila.pagoAnio === anio)!;
      assert.equal((await llamar('GET', `/${cuota.id_cuota}`, undefined, operador)).status, 200);
      assert.equal(usuarios.get(20)?.socio, false);
      assert.equal(auditorias.length, auditoriasAntes);
      assert.equal(filas.some((fila) => fila.id_usuario === 20 && fila.pagoAnio === anio), true);
    });

    await t.test('el cambio de socio recalcula solo las inscripciones pendientes', async () => {
      const anio = new Date().getFullYear();
      const socio = new Prisma.Decimal('10.00');
      const noSocio = new Prisma.Decimal('15.00');
      function crear(id: number, idUsuario: number, estadoInscripcion: string, estadoPago: string) {
        inscripciones.push({
          id_inscripcion: id,
          id_usuario: idUsuario,
          precioAplicado: new Prisma.Decimal('15.00'),
          estadoInscripcion,
          estadoPago,
          importeSocio: socio,
          importeNoSocio: noSocio,
        });
      }
      crear(501, 30, 'Activa', 'Pendiente');
      crear(502, 30, 'Activa', 'Pagado');
      crear(503, 30, 'Cancelada', 'Pendiente');
      crear(504, 31, 'Activa', 'Pendiente');
      const precio = (id: number) => inscripciones.find((fila) => fila.id_inscripcion === id)!.precioAplicado.toFixed(2);

      const lecturas = lecturasPrecio;
      const otra = await llamar('POST', '', { id_usuario: 31, pagoAnio: anio - 1 }, operador);
      assert.equal(otra.status, 201);
      assert.equal(usuarios.get(31)?.socio, false);
      assert.equal(precio(504), '15.00');
      assert.equal(lecturasPrecio, lecturas);

      const alta = await llamar('POST', '', { id_usuario: 30, pagoAnio: anio }, operador);
      assert.equal(alta.status, 201);
      assert.equal(usuarios.get(30)?.socio, true);
      assert.equal(precio(501), '10.00');
      assert.equal(precio(502), '15.00');
      assert.equal(precio(503), '15.00');

      const antes = lecturasPrecio;
      const idCuota = alta.body?.id_cuota as number;
      assert.equal((await llamar('PUT', `/${idCuota}`, { comentario: 'Nota de cuota' }, operador)).status, 200);
      assert.equal((await llamar('PUT', `/${idCuota}`, { fechaPago: `${anio}-05-01` }, operador)).status, 200);
      assert.equal(lecturasPrecio, antes);
      assert.equal(precio(501), '10.00');

      assert.equal((await llamar('DELETE', `/${idCuota}`, undefined, administrador)).status, 204);
      assert.equal(usuarios.get(30)?.socio, false);
      assert.equal(precio(501), '15.00');
      assert.equal(precio(502), '15.00');
      assert.equal(precio(503), '15.00');
    });

    await t.test('si falla el recálculo no queda cuota, socio ni auditoría', async () => {
      const anio = new Date().getFullYear();
      inscripciones.push({
        id_inscripcion: 505,
        id_usuario: 32,
        precioAplicado: new Prisma.Decimal('15.00'),
        estadoInscripcion: 'Activa',
        estadoPago: 'Pendiente',
        importeSocio: new Prisma.Decimal('10.00'),
        importeNoSocio: new Prisma.Decimal('15.00'),
      });
      const filasAntes = filas.length;
      const auditoriasAntes = auditorias.length;
      falloRecalculo = true;
      const resultado = await llamar('POST', '', { id_usuario: 32, pagoAnio: anio }, operador);
      falloRecalculo = false;
      assert.equal(resultado.status, 500);
      assert.equal(resultado.texto.includes('fallo al recalcular'), false);
      assert.equal(filas.length, filasAntes);
      assert.equal(filas.some((fila) => fila.id_usuario === 32), false);
      assert.equal(usuarios.get(32)?.socio, false);
      assert.equal(inscripciones.find((fila) => fila.id_inscripcion === 505)!.precioAplicado.toFixed(2), '15.00');
      assert.equal(auditorias.length, auditoriasAntes);
    });

    await t.test('si falla guardar socio no queda la cuota creada', async () => {
      const anio = new Date().getFullYear();
      const filasAntes = filas.length;
      const auditoriasAntes = auditorias.length;
      falloSocio = true;
      const resultado = await llamar('POST', '', { id_usuario: 10, pagoAnio: anio }, operador);
      falloSocio = false;
      assert.equal(resultado.status, 500);
      assert.equal(resultado.texto.includes('fallo al guardar socio'), false);
      assert.equal(filas.length, filasAntes);
      assert.equal(filas.some((fila) => fila.id_usuario === 10 && fila.pagoAnio === anio), false);
      assert.equal(usuarios.get(10)?.socio, false);
      assert.equal(auditorias.length, auditoriasAntes);
    });

    await t.test('el importe pagado sale de la configuración y el cliente no lo decide', async () => {
      sembrarConfiguracion(2030, '40.00');
      sembrarConfiguracion(2031, '45.00');
      const alta = await llamar('POST', '', { id_usuario: 4, pagoAnio: 2024, importePagado: 1 }, operador);
      assert.equal(alta.status, 201);
      assert.equal(alta.body?.importePagado, '30.00');
      assert.equal(new Prisma.Decimal(ultimaCreacion?.importePagado as Prisma.Decimal.Value).toFixed(2), '30.00');
      assert.equal(Object.hasOwn(ultimaCreacion ?? {}, 'importePagado'), true);

      const sinConfiguracion = await llamar('POST', '', { id_usuario: 30, pagoAnio: 2090 }, operador);
      assert.equal(sinConfiguracion.status, 409);
      assert.equal(sinConfiguracion.body?.code, 'CONFIGURACION_CUOTA_NO_EXISTE');
      assert.equal(sinConfiguracion.body?.message, 'No existe una configuración de cuota para ese año.');
      assert.equal(JSON.stringify(sinConfiguracion.body).includes('Prisma'), false);
      assert.equal(filas.some((fila) => fila.id_usuario === 30 && fila.pagoAnio === 2090), false);

      const cuota = filas.find((fila) => fila.id_usuario === 4 && fila.pagoAnio === 2024)!;
      const cambiada = await llamar('PUT', `/${cuota.id_cuota}`, { pagoAnio: 2030 }, operador);
      assert.equal(cambiada.status, 200);
      assert.equal(cambiada.body?.importePagado, '40.00');
      assert.equal(cuota.importePagado.toFixed(2), '40.00');

      const auditoriasAntes = auditorias.length;
      const socioAntes = usuarios.get(4)?.socio;
      const sinDestino = await llamar('PUT', `/${cuota.id_cuota}`, { pagoAnio: 2090 }, administrador);
      assert.equal(sinDestino.status, 409);
      assert.equal(sinDestino.body?.code, 'CONFIGURACION_CUOTA_NO_EXISTE');
      assert.equal(cuota.pagoAnio, 2030);
      assert.equal(cuota.importePagado.toFixed(2), '40.00');
      assert.equal(auditorias.length, auditoriasAntes);
      assert.equal(usuarios.get(4)?.socio, socioAntes);

      const comentario = await llamar('PUT', `/${cuota.id_cuota}`, { comentario: 'Solo comentario', importePagado: 1 }, operador);
      assert.equal(comentario.status, 200);
      assert.equal(comentario.body?.importePagado, '40.00');
      assert.equal(comentario.body?.comentario, 'Solo comentario');
      assert.deepEqual(Object.keys(ultimaActualizacion ?? {}), ['comentario']);

      const fecha = await llamar('PUT', `/${cuota.id_cuota}`, { fechaPago: '2024-06-01' }, operador);
      assert.equal(fecha.status, 200);
      assert.equal(fecha.body?.importePagado, '40.00');
      assert.equal(fecha.body?.fechaPago, '2024-06-01');
      assert.equal(cuota.pagoAnio, 2030);

      const rechazado = await llamar('PUT', `/${cuota.id_cuota}`, { importePagado: 99 }, operador);
      assert.equal(rechazado.status, 400);
      assert.equal(cuota.importePagado.toFixed(2), '40.00');

      const antigua = filas.find((fila) => fila.id_usuario === 15 && fila.pagoAnio === 2024)!;
      sembrarConfiguracion(2024, '35.00');
      const historica = await llamar('GET', `/${antigua.id_cuota}`, undefined, operador);
      assert.equal(historica.status, 200);
      assert.equal(historica.body?.importePagado, '30.00');
      assert.equal(antigua.importePagado.toFixed(2), '30.00');
      const posterior = await llamar('POST', '', { id_usuario: 32, pagoAnio: 2024 }, operador);
      assert.equal(posterior.status, 201);
      assert.equal(posterior.body?.importePagado, '35.00');
      sembrarConfiguracion(2024, '30.00');
    });

    await t.test('un fallo inesperado no devuelve el error interno', async () => {
      falloInterno = true;
      const resultado = await llamar('GET', '', undefined, operador);
      falloInterno = false;
      assert.equal(resultado.status, 500);
      assert.equal(resultado.body?.code, 'INTERNAL_SERVER_ERROR');
      assert.equal(resultado.texto.includes('motor-secreto'), false);
      assert.equal(resultado.texto.includes('Prisma'), false);
    });
  } finally {
    prisma.cuota = previos.cuota;
    prisma.configuracionCuotaAnual = previos.configuracionCuotaAnual;
    prisma.usuario = previos.usuario;
    prisma.sesionAutenticacion = previos.sesion;
    prisma.auditoria = previos.auditoria;
    prisma.inscripcionActividad = previos.inscripcion;
    prisma.$transaction = previos.transaction;
    const cerrado = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await cerrado;
  }
});
