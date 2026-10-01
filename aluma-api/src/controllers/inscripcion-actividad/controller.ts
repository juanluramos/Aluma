import type {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  getEnrollments,
  getEnrollment,
  createNewEnrollment,
  updateExistingEnrollment,
  deleteExistingEnrollment,
} from "../../services/inscripcion-actividad/service.js";



/**
 * Devuelve todas las inscripciones.
 */
export async function getAllEnrollmentsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const enrollments = await getEnrollments(
      req.user?.rol === "Usuario" ? req.user.id_usuario : undefined,
    );

    res.status(200).json(enrollments);
  } catch (error) {
    next(error);
  }
}

/**
 * Devuelve una inscripción por su ID.
 */
export async function getEnrollmentByIdController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
      res.status(400).json({
        message: "ID de inscripción inválido",
        code: "INVALID_ID",
      });

      return;
    }

    const enrollment = await getEnrollment(
      id, req.user?.rol === "Usuario" ? req.user.id_usuario : undefined,
    );

    res.status(200).json(enrollment);
  } catch (error) {
    next(error);
  }
}

/**
 * Crea una nueva inscripción.
 */
export async function createEnrollmentController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const enrollment =
      await createNewEnrollment(req.body);

    res.status(201).json(enrollment);
  } catch (error) {
    next(error);
  }
}
/**
 * Actualiza una inscripción existente.
 */
export async function updateEnrollmentController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
      res.status(400).json({
        message: "ID no válido",
        code: "INVALID_ID",
      });

      return;
    }

    const enrollment =
      await updateExistingEnrollment(
        id,
        req.body
      );

    res.status(200).json(enrollment);
  } catch (error) {
    next(error);
  }
}

/**
 * Elimina una inscripción existente.
 */
export async function deleteEnrollmentController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
      res.status(400).json({
        message: "ID de inscripción inválido",
        code: "INVALID_ID",
      });

      return;
    }

    await deleteExistingEnrollment(id);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
