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
import {
  getEnrollmentStatusByName,
  getPaymentStatusByName,
  lockActivityForEnrollment,
  occupiedSeatsForUpdate,
  withEnrollmentTransaction,
} from "../../repositories/inscripcion-actividad/repository.js";
import type { EnrollmentTransaction } from "../../repositories/inscripcion-actividad/repository.js";
import { createAudit } from "../auditoria/service.js";
import { recalcularPreciosPendientes } from "../inscripcion-actividad/recalcular-precios.js";
import { contarOcupacionPorActividad } from "../../repositories/actividad/ocupacion.js";
import { resumirOcupacion } from "./ocupacion.js";

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
  const actividades = await getAllActivities();
  if (actividades.length === 0) return [];
  const conteos = await contarOcupacionPorActividad();
  return resumirOcupacion(actividades, conteos.ocupadas, conteos.espera);
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

function mensajeAforoInsuficiente(aforo: number, ocupadas: number): string {
  const plazas = aforo === 1 ? "1 plaza" : `${aforo} plazas`;
  const ocupadasTexto = ocupadas === 1 ? "1 ocupada" : `${ocupadas} ocupadas`;
  return `No puedes reducir el aforo a ${plazas} porque actualmente hay ${ocupadasTexto}.`;
}

// El bloqueo de la actividad va antes del recuento, igual que en el alta y la activación.
async function rechazarAforoInsuficiente(
  activityId: number,
  aforo: number,
  tx: EnrollmentTransaction,
) {
  const pending = await getPaymentStatusByName("Pendiente", tx);
  const paid = await getPaymentStatusByName("Pagado", tx);
  if (!pending || !paid) {
    throw new AppError("Estado Pendiente no encontrado", 500, "PENDING_PAYMENT_STATUS_NOT_FOUND");
  }
  const active = await getEnrollmentStatusByName("Activa", tx);
  if (!active) {
    throw new AppError("Estado Activa no encontrado", 500, "ACTIVE_ENROLLMENT_STATUS_NOT_FOUND");
  }
  const ocupadas = await occupiedSeatsForUpdate(
    activityId,
    active.id_estado_inscripcion,
    [pending.id_estado_pago, paid.id_estado_pago],
    tx,
  );
  if (aforo < ocupadas) {
    throw new AppError(mensajeAforoInsuficiente(aforo, ocupadas), 409, "AFORO_INSUFICIENTE");
  }
}

/**
 * Actualiza una actividad existente.
 *
 * El primer bloqueo de la transacción es la fila de la actividad.
 * Si el aforo nuevo es numérico, se compara con las plazas ocupadas
 * antes de escribir o auditar.
 *
 * @param id - ID de la actividad.
 * @param data - Datos a actualizar.
 * @returns La actividad actualizada.
 *
 * @throws AppError Si la actividad no existe o el aforo no cubre las plazas ocupadas.
 */
export async function updateExistingActivity(
  id: number,
  data: UpdateActivityDto,
  context: ActivityCreationAuditContext
) {
  return withEnrollmentTransaction(async (tx) => {
    const bloqueada = await lockActivityForEnrollment(id, tx);
    if (!bloqueada) {
      throw new AppError("Actividad no encontrada", 404, "ACTIVITY_NOT_FOUND");
    }
    const anterior = await getActivityById(id, tx);
    if (!anterior) {
      throw new AppError("Actividad no encontrada", 404, "ACTIVITY_NOT_FOUND");
    }
    if (typeof data.aforo === "number") {
      await rechazarAforoInsuficiente(id, data.aforo, tx);
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
    if (antes.importeSocio !== despues.importeSocio || antes.importeNoSocio !== despues.importeNoSocio) {
      await recalcularPreciosPendientes(actualizado.id_actividad, {
        importeSocio: actualizado.importeSocio,
        importeNoSocio: actualizado.importeNoSocio,
      }, tx, context);
    }
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
  });
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
