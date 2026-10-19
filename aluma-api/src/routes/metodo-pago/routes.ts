import { Router } from "express";
import { getPaymentMethodsController } from "../../controllers/metodo-pago/controller.js";
import { authenticate } from "../../middlewares/auth/authenticate.middleware.js";
import { authorize } from "../../middlewares/auth/authorize.middleware.js";

const router = Router();

router.get("/", authenticate, authorize("Operador", "Administrador"), getPaymentMethodsController);

export default router;
