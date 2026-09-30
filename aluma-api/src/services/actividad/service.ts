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
  data: CreateActivityDto
) {
  return createActivity(data);
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
  data: UpdateActivityDto
) {
  await getActivity(id);

  return updateActivity(id, data);
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
  id: number
) {
  await getActivity(id);

  return deleteActivity(id);
}