import type {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  getActivities,
  getActivity,
  createNewActivity,
  updateExistingActivity,
  deleteExistingActivity,
} from "../../services/actividad/service.js";

import { createActivitySchema } from "../../dtos/actividad/create-activity.dto.js";
import { updateActivitySchema } from "../../dtos/actividad/update-activity.dto.js";

/**
 * Devuelve todas las actividades.
 *
 * @param _req Petición HTTP.
 * @param res Respuesta HTTP.
 * @param next Función que envía los errores al middleware global.
 */
export async function getAllActivitiesController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const activities = await getActivities();

    res.status(200).json(activities);
  } catch (error) {
    next(error);
  }
}

/**
 * Devuelve una actividad por su ID.
 *
 * @param req Petición HTTP.
 * @param res Respuesta HTTP.
 * @param next Función que envía los errores al middleware global.
 */
export async function getActivityByIdController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Number(req.params.id);

    /**
     * Comprobamos que el ID sea válido.
     */
    if (Number.isNaN(id)) {
      res.status(400).json({
        message: "ID de actividad inválido",
      });

      return;
    }

    const activity = await getActivity(id);

    res.status(200).json(activity);
  } catch (error) {
    next(error);
  }
}

/**
 * Crea una nueva actividad.
 *
 * @param req Petición HTTP.
 * @param res Respuesta HTTP.
 * @param next Función que envía los errores al middleware global.
 */
export async function createActivityController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = createActivitySchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Datos de actividad no válidos",
        errors: result.error.issues,
      });

      return;
    }

    const activity = await createNewActivity(result.data);

    res.status(201).json(activity);
  } catch (error) {
    next(error);
  }
}

/**
 * Actualiza una actividad existente.
 *
 * @param req Petición HTTP.
 * @param res Respuesta HTTP.
 * @param next Función que envía los errores al middleware global.
 */
export async function updateActivityController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Number(req.params.id);

    /**
     * Comprobamos que el ID sea válido.
     */
    if (Number.isNaN(id)) {
      res.status(400).json({
        message: "ID de actividad inválido",
      });

      return;
    }

    /**
     * Validamos los datos con Zod.
     */
    const result = updateActivitySchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Datos de actividad no válidos",
        errors: result.error.issues,
      });

      return;
    }

    const updatedActivity = await updateExistingActivity(
      id,
      result.data
    );

    res.status(200).json(updatedActivity);
  } catch (error) {
    next(error);
  }
}

/**
 * Elimina una actividad existente.
 *
 * @param req Petición HTTP.
 * @param res Respuesta HTTP.
 * @param next Función que envía los errores al middleware global.
 */
export async function deleteActivityController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Number(req.params.id);

    /**
     * Comprobamos que el ID sea válido.
     */
    if (Number.isNaN(id)) {
      res.status(400).json({
        message: "ID de actividad inválido",
      });

      return;
    }

    await deleteExistingActivity(id);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}