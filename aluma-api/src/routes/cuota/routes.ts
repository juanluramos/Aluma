import { Router } from "express";
import {
  createCuotaController,
  deleteCuotaController,
  getAllCuotasController,
  getCuotaByIdController,
  getCuotasByUsuarioController,
  updateCuotaController,
} from "../../controllers/cuota/controller.js";
import { validateBody } from "../../middlewares/validate.middleware.js";
import { authenticate } from "../../middlewares/auth/authenticate.middleware.js";
import { authorize } from "../../middlewares/auth/authorize.middleware.js";
import { createCuotaSchema } from "../../dtos/cuota/create-cuota.dto.js";
import { updateCuotaSchema } from "../../dtos/cuota/update-cuota.dto.js";

const router = Router();

router.use(authenticate, authorize("Operador", "Administrador"));

router.get("/", getAllCuotasController);
router.get("/usuario/:idUsuario", getCuotasByUsuarioController);
router.get("/:id", getCuotaByIdController);
router.post("/", validateBody(createCuotaSchema), createCuotaController);
router.put("/:id", validateBody(updateCuotaSchema), updateCuotaController);
router.delete("/:id", deleteCuotaController);

export default router;
