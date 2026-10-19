import { Router } from "express";
import {
  createConfiguracionCuotaController,
  deleteConfiguracionCuotaController,
  getAllConfiguracionesCuotaController,
  getConfiguracionCuotaByIdController,
  updateConfiguracionCuotaController,
} from "../../controllers/configuracion-cuota/controller.js";
import { validateBody } from "../../middlewares/validate.middleware.js";
import { authenticate } from "../../middlewares/auth/authenticate.middleware.js";
import { authorize } from "../../middlewares/auth/authorize.middleware.js";
import { createConfiguracionCuotaSchema } from "../../dtos/configuracion-cuota/create-configuracion-cuota.dto.js";
import { updateConfiguracionCuotaSchema } from "../../dtos/configuracion-cuota/update-configuracion-cuota.dto.js";

const router = Router();

router.use(authenticate, authorize("Administrador"));

router.get("/", getAllConfiguracionesCuotaController);
router.get("/:id", getConfiguracionCuotaByIdController);
router.post("/", validateBody(createConfiguracionCuotaSchema), createConfiguracionCuotaController);
router.put("/:id", validateBody(updateConfiguracionCuotaSchema), updateConfiguracionCuotaController);
router.delete("/:id", deleteConfiguracionCuotaController);

export default router;
