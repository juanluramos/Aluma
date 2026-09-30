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

import { createEnrollmentSchema } from "../../dtos/inscripcion-actividad/create-enrollment.dto.js";
import { updateEnrollmentSchema } from "../../dtos/inscripcion-actividad/update-enrollment.dto.js";

/**
 * Devuelve todas las inscripciones.
 */
export async function getAllEnrollmentsController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const enrollments = await getEnrollments();

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

    if (Number.isNaN(id)) {
      res.status(400).json({
        message: "ID de inscripción inválido",
      });

      return;
    }

    const enrollment = await getEnrollment(id);

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
    const result = createEnrollmentSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Datos de inscripción no válidos",
        errors: result.error.issues,
      });

      return;
    }

    const enrollment = await createNewEnrollment(result.data);

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

    if (Number.isNaN(id)) {
      res.status(400).json({
        message: "ID de inscripción inválido",
      });

      return;
    }

    const result = updateEnrollmentSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Datos de inscripción no válidos",
        errors: result.error.issues,
      });

      return;
    }

    const updatedEnrollment =
      await updateExistingEnrollment(
        id,
        result.data
      );

    res.status(200).json(updatedEnrollment);
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

    if (Number.isNaN(id)) {
      res.status(400).json({
        message: "ID de inscripción inválido",
      });

      return;
    }

    await deleteExistingEnrollment(id);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}