import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../errors/app-error.js";
import type { CreateCuotaDto } from "../../dtos/cuota/create-cuota.dto.js";
import type { UpdateCuotaDto } from "../../dtos/cuota/update-cuota.dto.js";
import { textoFechaCalendario } from "../../utils/fechaCalendario.js";
import { findConfiguracionPorAnio } from "../../repositories/configuracion-cuota/repository.js";
import { configuracionCuotaAusente } from "../configuracion-cuota/service.js";
import { createAudit } from "../auditoria/service.js";
import { recalcularPreciosDeUsuario } from "../inscripcion-actividad/recalcular-precios.js";
import {
  createCuota,
  deleteCuota,
  findCuotaByUsuarioAnio,
  getAllCuotas,
  getCuotaById,
  getCuotasByUsuario,
  getUsuarioDeCuota,
  guardarSocioPorCuota,
  updateCuota,
} from "../../repositories/cuota/repository.js";
import type { CuotaLectura } from "../../repositories/cuota/repository.js";

export interface CuotaAuditContext {
  requestId: string;
  id_usuario: number;
  rol_actor: string;
}

type CuotaPresentada = Omit<CuotaLectura, "fechaPago" | "importePagado"> & {
  fechaPago: string;
  importePagado: string;
};

function presentar(cuota: CuotaLectura): CuotaPresentada {
  return {
    ...cuota,
    fechaPago: textoFechaCalendario(cuota.fechaPago),
    importePagado: cuota.importePagado.toFixed(2),
  };
}

function cuotaNoEncontrada(): AppError {
  return new AppError("Cuota no encontrada", 404, "CUOTA_NOT_FOUND");
}

function cuotaDuplicada(): AppError {
  return new AppError(
    "Este usuario ya tiene una cuota registrada para ese año.",
    409,
    "CUOTA_DUPLICADA",
  );
}

async function exigirUsuario(idUsuario: number, client: Prisma.TransactionClient | typeof prisma = prisma) {
  const usuario = await getUsuarioDeCuota(idUsuario, client);
  if (!usuario) {
    throw new AppError("Usuario no encontrado", 404, "USER_NOT_FOUND");
  }
}

async function exigirAnioLibre(
  idUsuario: number,
  pagoAnio: number,
  idCuotaActual: number | null,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const existente = await findCuotaByUsuarioAnio(idUsuario, pagoAnio, client);
  if (existente && existente.id_cuota !== idCuotaActual) {
    throw cuotaDuplicada();
  }
}

type SujetoCuota = { id_usuario: number; pagoAnio: number };

/**
 * Dice qué usuarios deben cambiar de socio al crear, editar o borrar una cuota.
 * Solo el año recibido cuenta. No consulta ni reescribe al leer.
 */
export function efectosSocio(
  antes: SujetoCuota | null,
  despues: SujetoCuota | null,
  anioActual: number,
): { id_usuario: number; socio: boolean }[] {
  const afectaba = antes?.pagoAnio === anioActual;
  const afecta = despues?.pagoAnio === anioActual;
  if (!afectaba && !afecta) return [];
  if (antes && despues && antes.id_usuario === despues.id_usuario) {
    if (afectaba === afecta) return [];
    return [{ id_usuario: antes.id_usuario, socio: afecta }];
  }
  const efectos: { id_usuario: number; socio: boolean }[] = [];
  if (afectaba && antes) efectos.push({ id_usuario: antes.id_usuario, socio: false });
  if (afecta && despues) efectos.push({ id_usuario: despues.id_usuario, socio: true });
  return efectos;
}

async function aplicarSocio(
  antes: SujetoCuota | null,
  despues: SujetoCuota | null,
  idCuota: number,
  context: CuotaAuditContext,
  client: Prisma.TransactionClient,
) {
  const anioActual = new Date().getFullYear();
  for (const efecto of efectosSocio(antes, despues, anioActual)) {
    const cambio = await guardarSocioPorCuota(efecto.id_usuario, efecto.socio, client);
    if (!cambio) continue;
    await createAudit({
      requestId: context.requestId,
      id_usuario: context.id_usuario,
      rol_actor: context.rol_actor,
      accion: "USUARIO_MODIFICADO",
      recurso: "USUARIO",
      id_recurso: efecto.id_usuario,
      resultado: "REALIZADA",
      codigo_error: null,
      detalles: {
        origen: "CUOTA",
        id_cuota: idCuota,
        cambios: { socio: { anterior: cambio.anterior, nuevo: cambio.nuevo } },
      },
    }, client);
    await recalcularPreciosDeUsuario(efecto.id_usuario, cambio.nuevo, client, context);
  }
}

function relanzar(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw cuotaDuplicada();
  }
  throw error;
}

export async function getCuotas() {
  return (await getAllCuotas()).map(presentar);
}

export async function getCuota(id: number) {
  const cuota = await getCuotaById(id);
  if (!cuota) throw cuotaNoEncontrada();
  return presentar(cuota);
}

export async function getCuotasDeUsuario(idUsuario: number) {
  await exigirUsuario(idUsuario);
  return (await getCuotasByUsuario(idUsuario)).map(presentar);
}

export async function createNewCuota(data: CreateCuotaDto, context: CuotaAuditContext) {
  await exigirUsuario(data.id_usuario);
  await exigirAnioLibre(data.id_usuario, data.pagoAnio, null);
  try {
    return await prisma.$transaction(async (tx) => {
      const configuracion = await findConfiguracionPorAnio(data.pagoAnio, tx);
      if (!configuracion) throw configuracionCuotaAusente();
      const cuota = await createCuota(data, configuracion.importe, tx);
      await createAudit({
        requestId: context.requestId,
        id_usuario: context.id_usuario,
        rol_actor: context.rol_actor,
        accion: "CUOTA_CREADA",
        recurso: "CUOTA",
        id_recurso: cuota.id_cuota,
        resultado: "REALIZADA",
        codigo_error: null,
        detalles: null,
      }, tx);
      await aplicarSocio(null, { id_usuario: cuota.id_usuario, pagoAnio: cuota.pagoAnio }, cuota.id_cuota, context, tx);
      return presentar(cuota);
    });
  } catch (error) {
    relanzar(error);
  }
}

function valoresAuditables(cuota: CuotaLectura) {
  return {
    id_usuario: cuota.id_usuario,
    pagoAnio: cuota.pagoAnio,
    fechaPago: textoFechaCalendario(cuota.fechaPago),
    importePagado: cuota.importePagado.toFixed(2),
    comentario: cuota.comentario,
  };
}

export async function updateExistingCuota(id: number, data: UpdateCuotaDto, context: CuotaAuditContext) {
  try {
    return await prisma.$transaction(async (tx) => {
      const actual = await getCuotaById(id, tx);
      if (!actual) throw cuotaNoEncontrada();
      if (data.id_usuario !== undefined) {
        await exigirUsuario(data.id_usuario, tx);
      }
      if (data.id_usuario !== undefined || data.pagoAnio !== undefined) {
        await exigirAnioLibre(
          data.id_usuario ?? actual.id_usuario,
          data.pagoAnio ?? actual.pagoAnio,
          actual.id_cuota,
          tx,
        );
      }
      let importePagado: Prisma.Decimal | undefined;
      if (data.pagoAnio !== undefined && data.pagoAnio !== actual.pagoAnio) {
        const configuracion = await findConfiguracionPorAnio(data.pagoAnio, tx);
        if (!configuracion) throw configuracionCuotaAusente();
        importePagado = configuracion.importe;
      }
      const actualizada = await updateCuota(id, data, importePagado, tx);
      const antes = valoresAuditables(actual);
      const despues = valoresAuditables(actualizada);
      const cambios: Record<string, { anterior: string | number | null; nuevo: string | number | null }> = {};
      for (const campo of Object.keys(antes) as (keyof typeof antes)[]) {
        if (antes[campo] !== despues[campo]) {
          const textoPrivado = campo === "comentario";
          cambios[campo] = {
            anterior: textoPrivado && antes[campo] !== null ? "[REDACTADO]" : antes[campo],
            nuevo: textoPrivado && despues[campo] !== null ? "[REDACTADO]" : despues[campo],
          };
        }
      }
      if (Object.keys(cambios).length > 0) {
        await createAudit({
          requestId: context.requestId,
          id_usuario: context.id_usuario,
          rol_actor: context.rol_actor,
          accion: "CUOTA_MODIFICADA",
          recurso: "CUOTA",
          id_recurso: actualizada.id_cuota,
          resultado: "REALIZADA",
          codigo_error: null,
          detalles: { cambios },
        }, tx);
      }
      await aplicarSocio(
        { id_usuario: actual.id_usuario, pagoAnio: actual.pagoAnio },
        { id_usuario: actualizada.id_usuario, pagoAnio: actualizada.pagoAnio },
        actualizada.id_cuota,
        context,
        tx,
      );
      return presentar(actualizada);
    });
  } catch (error) {
    relanzar(error);
  }
}

export async function deleteExistingCuota(id: number, context: CuotaAuditContext) {
  try {
    return await prisma.$transaction(async (tx) => {
      const actual = await getCuotaById(id, tx);
      if (!actual) throw cuotaNoEncontrada();
      const eliminada = await deleteCuota(id, tx);
      await createAudit({
        requestId: context.requestId,
        id_usuario: context.id_usuario,
        rol_actor: context.rol_actor,
        accion: "CUOTA_ELIMINADA",
        recurso: "CUOTA",
        id_recurso: eliminada.id_cuota,
        resultado: "REALIZADA",
        codigo_error: null,
        detalles: null,
      }, tx);
      await aplicarSocio(
        { id_usuario: actual.id_usuario, pagoAnio: actual.pagoAnio },
        null,
        eliminada.id_cuota,
        context,
        tx,
      );
      return eliminada;
    });
  } catch (error) {
    relanzar(error);
  }
}
