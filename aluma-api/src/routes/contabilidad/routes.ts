import { Router } from "express";
import { authenticate } from "../../middlewares/auth/authenticate.middleware.js";
import { authorize } from "../../middlewares/auth/authorize.middleware.js";
import { getResumenContableController } from "../../controllers/contabilidad/controller.js";

const router = Router();

router.get("/resumen", authenticate, authorize("Administrador"), getResumenContableController);

export default router;
