import { Router } from "express";
import { getEnrollmentStatusesController } from "../../controllers/estado-inscripcion/controller.js";
import { authenticate } from "../../middlewares/auth/authenticate.middleware.js";
import { authorize } from "../../middlewares/auth/authorize.middleware.js";

const router = Router();

router.get(
  "/",
  authenticate,
  authorize("Usuario", "Operador", "Administrador"),
  getEnrollmentStatusesController,
);

export default router;
