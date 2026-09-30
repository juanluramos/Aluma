import { Router } from "express";

import {
  getAllAccountingMovementsController,
  getAccountingMovementByIdController,
  createAccountingMovementController,
  updateAccountingMovementController,
  deleteAccountingMovementController,
} from "../../controllers/movimiento-contable/controller.js";

const router = Router();

router.get("/", getAllAccountingMovementsController);

router.get("/:id", getAccountingMovementByIdController);

router.post("/", createAccountingMovementController);

router.put("/:id", updateAccountingMovementController);

router.delete("/:id", deleteAccountingMovementController);

export default router;