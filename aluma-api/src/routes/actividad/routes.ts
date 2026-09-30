import { Router } from "express";

import {
  getAllActivitiesController,
  getActivityByIdController,
  createActivityController,
  updateActivityController,
  deleteActivityController,
} from "../../controllers/actividad/controller.js";

const router = Router();

/**
 * Devuelve todas las actividades.
 *
 * GET /api/actividades
 */
router.get("/", getAllActivitiesController);

/**
 * Devuelve una actividad por su ID.
 *
 * GET /api/actividades/:id
 */
router.get("/:id", getActivityByIdController);

/**
 * Crea una nueva actividad.
 *
 * POST /api/actividades
 */
router.post("/", createActivityController);

/**
 * Actualiza una actividad existente.
 *
 * PUT /api/actividades/:id
 */
router.put("/:id", updateActivityController);

/**
 * Elimina una actividad existente.
 *
 * DELETE /api/actividades/:id
 */
router.delete("/:id", deleteActivityController);

export default router;