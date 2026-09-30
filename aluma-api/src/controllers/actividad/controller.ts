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
        code: "INVALID_ID",
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
    const activity =
      await createNewActivity(req.body);

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

    if (Number.isNaN(id)) {
      res.status(400).json({
        message: "ID no válido",
        code: "INVALID_ID",
      });

      return;
    }

    const activity =
      await updateExistingActivity(
        id,
        req.body
      );

    res.status(200).json(activity);
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
        code: "INVALID_ID",
      });

      return;
    }

    await deleteExistingActivity(id);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}