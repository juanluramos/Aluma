import { Router } from "express";

import {
  getAllAccountingMovementsController,
  getAccountingMovementByIdController,
  createAccountingMovementController,
  updateAccountingMovementController,
  deleteAccountingMovementController,
} from "../../controllers/movimiento-contable/controller.js";

import { validateBody } from "../../middlewares/validate.middleware.js";

import { createAccountingMovementSchema } from "../../dtos/movimiento-contable/create-accounting-movement.dto.js";

import { updateAccountingMovementSchema } from "../../dtos/movimiento-contable/update-accounting-movement.dto.js";

const router = Router();

router.get("/", getAllAccountingMovementsController);

router.get("/:id", getAccountingMovementByIdController);

router.post("/", validateBody(createAccountingMovementSchema),
  createAccountingMovementController
);

router.put("/:id", validateBody(updateAccountingMovementSchema),
  updateAccountingMovementController
);

router.delete("/:id", deleteAccountingMovementController);

export default router;