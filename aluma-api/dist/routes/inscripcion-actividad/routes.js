import { Router } from "express";
import { getAllEnrollmentsController, getEnrollmentByIdController, createEnrollmentController, updateEnrollmentController, deleteEnrollmentController, } from "../../controllers/inscripcion-actividad/controller.js";
import { validateBody } from "../../middlewares/validate.middleware.js";
import { createEnrollmentSchema } from "../../dtos/inscripcion-actividad/create-enrollment.dto.js";
import { updateEnrollmentSchema } from "../../dtos/inscripcion-actividad/update-enrollment.dto.js";
import { authenticate } from "../../middlewares/auth/authenticate.middleware.js";
import { authorize } from "../../middlewares/auth/authorize.middleware.js";
import { authorizeEnrollmentCreate } from "../../middlewares/auth/authorize-enrollment-create.middleware.js";
const router = Router();
router.use(authenticate, authorize("Usuario", "Operador", "Administrador"));
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
router.post("/", validateBody(createEnrollmentSchema), authorizeEnrollmentCreate, createEnrollmentController);
/**
 * Actualiza una inscripción existente.
 *
 * PUT /api/inscripciones/:id
 */
router.put("/:id", authorize("Operador", "Administrador"), validateBody(updateEnrollmentSchema), updateEnrollmentController);
/**
 * Elimina una inscripción existente.
 *
 * DELETE /api/inscripciones/:id
 */
router.delete("/:id", authorize("Administrador"), deleteEnrollmentController);
export default router;
//# sourceMappingURL=routes.js.map