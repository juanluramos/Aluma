import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../errors/app-error.js";
import type { CreateConfiguracionCuotaDto } from "../../dtos/configuracion-cuota/create-configuracion-cuota.dto.js";
import type { UpdateConfiguracionCuotaDto } from "../../dtos/configuracion-cuota/update-configuracion-cuota.dto.js";
import { contarCuotasDelAnio } from "../../repositories/cuota/repository.js";
import {
  createConfiguracionCuota,
  deleteConfiguracionCuota,
  findConfiguracionPorAnio,
  getAllConfiguracionesCuota,
  getConfiguracionCuotaById,
  updateConfiguracionCuota,
} from "../../repositories/configuracion-cuota/repository.js";
import type { ConfiguracionCuotaLectura } from "../../repositories/configuracion-cuota/repository.js";
import { createAudit } from "../auditoria/service.js";

export interface ConfiguracionCuotaAuditContext {
  requestId: string;
  id_usuario: number;
  rol_actor: string;
}

type ConfiguracionPresentada = Omit<ConfiguracionCuotaLectura, "importe"> & { importe: string };

function presentar(configuracion: ConfiguracionCuotaLectura): ConfiguracionPresentada {
  return { ...configuracion, importe: configuracion.importe.toFixed(2) };
}

function configuracionNoEncontrada(): AppError {
  return new AppError("Configuración de cuota no encontrada", 404, "CONFIGURACION_CUOTA_NOT_FOUND");
}

function configuracionDuplicada(): AppError {
  return new AppError(
    "No puede existir más de una configuración para el mismo año.",
    409,
    "CONFIGURACION_CUOTA_DUPLICADA",
  );
}

export function configuracionCuotaAusente(): AppError {
  return new AppError(
    "No existe una configuración de cuota para ese año.",
    409,
    "CONFIGURACION_CUOTA_NO_EXISTE",
  );
}

function configuracionEnUso(): AppError {
  return new AppError(
    "No se puede eliminar la configuración porque existen cuotas registradas para ese año.",
    409,
    "CONFIGURACION_CUOTA_EN_USO",
  );
}

async function exigirAnioLibre(
  anio: number,
  idActual: number | null,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const existente = await findConfiguracionPorAnio(anio, client);
  if (existente && existente.id_configuracion !== idActual) {
    throw configuracionDuplicada();
  }
}

function relanzar(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw configuracionDuplicada();
  }
  throw error;
}

export async function getConfiguracionesCuota() {
  return (await getAllConfiguracionesCuota()).map(presentar);
}

export async function getConfiguracionCuota(id: number) {
  const configuracion = await getConfiguracionCuotaById(id);
  if (!configuracion) throw configuracionNoEncontrada();
  return presentar(configuracion);
}

export async function createNewConfiguracionCuota(
  data: CreateConfiguracionCuotaDto,
  context: ConfiguracionCuotaAuditContext,
) {
  await exigirAnioLibre(data.anio, null);
  try {
    return await prisma.$transaction(async (tx) => {
      const configuracion = await createConfiguracionCuota(data, tx);
      await createAudit({
        requestId: context.requestId,
        id_usuario: context.id_usuario,
        rol_actor: context.rol_actor,
        accion: "CONFIGURACION_CUOTA_CREADA",
        recurso: "CONFIGURACION_CUOTA",
        id_recurso: configuracion.id_configuracion,
        resultado: "REALIZADA",
        codigo_error: null,
        detalles: { anio: configuracion.anio, importe: configuracion.importe.toFixed(2) },
      }, tx);
      return presentar(configuracion);
    });
  } catch (error) {
    relanzar(error);
  }
}

export async function updateExistingConfiguracionCuota(
  id: number,
  data: UpdateConfiguracionCuotaDto,
  context: ConfiguracionCuotaAuditContext,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const actual = await getConfiguracionCuotaById(id, tx);
      if (!actual) throw configuracionNoEncontrada();
      if (data.anio !== undefined && data.anio !== actual.anio) {
        await exigirAnioLibre(data.anio, actual.id_configuracion, tx);
      }
      const actualizada = await updateConfiguracionCuota(id, data, tx);
      const antes = { anio: actual.anio, importe: actual.importe.toFixed(2) };
      const despues = { anio: actualizada.anio, importe: actualizada.importe.toFixed(2) };
      const cambios: Record<string, { anterior: string | number; nuevo: string | number }> = {};
      for (const campo of Object.keys(antes) as (keyof typeof antes)[]) {
        if (antes[campo] !== despues[campo]) {
          cambios[campo] = { anterior: antes[campo], nuevo: despues[campo] };
        }
      }
      if (Object.keys(cambios).length > 0) {
        await createAudit({
          requestId: context.requestId,
          id_usuario: context.id_usuario,
          rol_actor: context.rol_actor,
          accion: "CONFIGURACION_CUOTA_MODIFICADA",
          recurso: "CONFIGURACION_CUOTA",
          id_recurso: actualizada.id_configuracion,
          resultado: "REALIZADA",
          codigo_error: null,
          detalles: { cambios },
        }, tx);
      }
      return presentar(actualizada);
    });
  } catch (error) {
    relanzar(error);
  }
}

export async function deleteExistingConfiguracionCuota(
  id: number,
  context: ConfiguracionCuotaAuditContext,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const actual = await getConfiguracionCuotaById(id, tx);
      if (!actual) throw configuracionNoEncontrada();
      const cuotas = await contarCuotasDelAnio(actual.anio, tx);
      if (cuotas > 0) throw configuracionEnUso();
      const eliminada = await deleteConfiguracionCuota(id, tx);
      await createAudit({
        requestId: context.requestId,
        id_usuario: context.id_usuario,
        rol_actor: context.rol_actor,
        accion: "CONFIGURACION_CUOTA_ELIMINADA",
        recurso: "CONFIGURACION_CUOTA",
        id_recurso: eliminada.id_configuracion,
        resultado: "REALIZADA",
        codigo_error: null,
        detalles: { anio: eliminada.anio },
      }, tx);
      return eliminada;
    });
  } catch (error) {
    relanzar(error);
  }
}
