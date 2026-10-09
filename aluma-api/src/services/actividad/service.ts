import {
  getAllActivities,
  getActivityById,
  createActivity,
  updateActivity,
  deleteActivity,
} from "../../repositories/actividad/respository.js";

import type { CreateActivityDto } from "../../dtos/actividad/create-activity.dto.js";
import type { UpdateActivityDto } from "../../dtos/actividad/update-activity.dto.js";

import { AppError } from "../../errors/app-error.js";
import { prisma } from "../../config/prisma.js";
import { createAudit } from "../auditoria/service.js";

export interface ActivityCreationAuditContext {
  requestId: string;
  id_usuario: number;
  rol_actor: string;
}

/**
 * Obtiene todas las actividades.
 *
 * @returns Lista de actividades.
 */
export async function getActivities() {
 
  return getAllActivities();
}

/**
 * Obtiene una actividad por su ID.
 *
 * @param id - ID de la actividad.
 * @returns La actividad encontrada.
 *
 * @throws AppError Si la actividad no existe.
 */
export async function getActivity(id: number) {
  const activity = await getActivityById(id);

  if (!activity) {
    throw new AppError(
      "Actividad no encontrada",
      404,
      "ACTIVITY_NOT_FOUND"
    );
  }

  return activity;
}

/**
 * Crea una nueva actividad.
 *
 * @param data - Datos validados de la actividad.
 * @returns La actividad creada.
 */
export async function createNewActivity(
  data: CreateActivityDto,
  context: ActivityCreationAuditContext
) {
  return prisma.$transaction(async (tx) => {
    const activity = await createActivity(data, tx);
    await createAudit({
      requestId: context.requestId,
      id_usuario: context.id_usuario,
      rol_actor: context.rol_actor,
      accion: "ACTIVIDAD_CREADA",
      recurso: "ACTIVIDAD",
      id_recurso: activity.id_actividad,
      resultado: "REALIZADA",
      codigo_error: null,
      detalles: null,
    }, tx);
    return activity;
  });
}

/**
 * Actualiza una actividad existente.
 *
 * Comprueba primero que la actividad exista.
 *
 * @param id - ID de la actividad.
 * @param data - Datos a actualizar.
 * @returns La actividad actualizada.
 *
 * @throws AppError Si la actividad no existe.
 */
export async function updateExistingActivity(
  id: number,
  data: UpdateActivityDto,
  context: ActivityCreationAuditContext
) {
  return prisma.$transaction(async (tx) => {
    const anterior = await getActivityById(id, tx);
    if (!anterior) {
      throw new AppError("Actividad no encontrada", 404, "ACTIVITY_NOT_FOUND");
    }
    const actualizado = await updateActivity(id, data, tx);
    // Solo campos editables; normalizar fechas y decimales sin perder precision.
    const valores = (activity: typeof actualizado) => ({
      titulo: activity.titulo,
      aforo: activity.aforo,
      fecha: activity.fecha?.toISOString() ?? null,
      importeSocio: activity.importeSocio?.toFixed(2) ?? null,
      importeNoSocio: activity.importeNoSocio?.toFixed(2) ?? null,
      id_estado_actividad: activity.id_estado_actividad,
      comentario: activity.comentario,
    });
    const antes = valores(anterior);
    const despues = valores(actualizado);
    const cambios: Record<string, {
      anterior: string | number | null;
      nuevo: string | number | null;
    }> = {};
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
        accion: "ACTIVIDAD_MODIFICADA",
        recurso: "ACTIVIDAD",
        id_recurso: actualizado.id_actividad,
        resultado: "REALIZADA",
        codigo_error: null,
        detalles: { cambios },
      }, tx);
    }
    return actualizado;
  }, { isolationLevel: "Serializable" });
}

/**
 * Elimina una actividad existente.
 *
 * Comprueba primero que la actividad exista.
 *
 * @param id - ID de la actividad.
 * @returns La actividad eliminada.
 *
 * @throws AppError Si la actividad no existe.
 */
export async function deleteExistingActivity(
  id: number,
  context: ActivityCreationAuditContext
) {
  return prisma.$transaction(async (tx) => {
    const activity = await getActivityById(id, tx);
    if (!activity) {
      throw new AppError("Actividad no encontrada", 404, "ACTIVITY_NOT_FOUND");
    }
    const deleted = await deleteActivity(activity.id_actividad, tx);
    await createAudit({
      requestId: context.requestId,
      id_usuario: context.id_usuario,
      rol_actor: context.rol_actor,
      accion: "ACTIVIDAD_ELIMINADA",
      recurso: "ACTIVIDAD",
      id_recurso: activity.id_actividad,
      resultado: "REALIZADA",
      codigo_error: null,
      detalles: null,
    }, tx);
    return deleted;
  });
}
