import { Router } from "express";

import {
  getAllActivitiesController,
  getActivityByIdController,
  createActivityController,
  updateActivityController,
  deleteActivityController,
} from "../../controllers/actividad/controller.js";
import { validateBody } from "../../middlewares/validate.middleware.js";

import {
  createActivitySchema,
} from "../../dtos/actividad/create-activity.dto.js";

import {
  updateActivitySchema,
} from "../../dtos/actividad/update-activity.dto.js";

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
router.post("/", validateBody(createActivitySchema), createActivityController);

/**
 * Actualiza una actividad existente.
 *
 * PUT /api/actividades/:id
 */
router.put("/:id", validateBody(updateActivitySchema), updateActivityController);

/**
 * Elimina una actividad existente.
 *
 * DELETE /api/actividades/:id
 */
router.delete("/:id", deleteActivityController);

export default router;