import { Router } from "express";
import { getPaymentStatusesController } from "../../controllers/estado-pago/controller.js";
import { authenticate } from "../../middlewares/auth/authenticate.middleware.js";
import { authorize } from "../../middlewares/auth/authorize.middleware.js";

const router = Router();

router.get("/", authenticate, authorize("Operador", "Administrador"), getPaymentStatusesController);

export default router;
