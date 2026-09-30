import { Router } from "express";

import {
  getAllEnrollmentsController,
  getEnrollmentByIdController,
  createEnrollmentController,
  updateEnrollmentController,
  deleteEnrollmentController,
} from "../../controllers/inscripcion-actividad/controller.js";

const router = Router();

/**
 * Devuelve todas las inscripciones.
 *
 * GET /api/inscripciones
 */
router.get("/", getAllEnrollmentsController);

/**
 * Devuelve una inscripción por su ID.
 *
 * GET /api/inscripciones/:id
 */
router.get("/:id", getEnrollmentByIdController);

/**
 * Crea una nueva inscripción.
 *
 * POST /api/inscripciones
 */
router.post("/", createEnrollmentController);

/**
 * Actualiza una inscripción existente.
 *
 * PUT /api/inscripciones/:id
 */
router.put("/:id", updateEnrollmentController);

/**
 * Elimina una inscripción existente.
 *
 * DELETE /api/inscripciones/:id
 */
router.delete("/:id", deleteEnrollmentController);

export default router;