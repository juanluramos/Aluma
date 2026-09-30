import type {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  getAccountingMovements,
  getAccountingMovement,
  createNewAccountingMovement,
  updateExistingAccountingMovement,
  deleteExistingAccountingMovement,
} from "../../services/movimiento-contable/service.js";

import {
  createAccountingMovementSchema,
} from "../../dtos/movimiento-contable/create-accounting-movement.dto.js";

import {
  updateAccountingMovementSchema,
} from "../../dtos/movimiento-contable/update-accounting-movement.dto.js";

/**
 * Devuelve todos los movimientos contables.
 */
export async function getAllAccountingMovementsController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const movements = await getAccountingMovements();

    res.status(200).json(movements);
  } catch (error) {
    next(error);
  }
}

/**
 * Devuelve un movimiento contable por ID.
 */
export async function getAccountingMovementByIdController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      res.status(400).json({
        message: "ID de movimiento no válido",
      });

      return;
    }

    const movement = await getAccountingMovement(id);

    res.status(200).json(movement);
  } catch (error) {
    next(error);
  }
}

/**
 * Crea un nuevo movimiento contable.
 */
export async function createAccountingMovementController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result =
      createAccountingMovementSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Datos de movimiento no válidos",
        errors: result.error.issues,
      });

      return;
    }

    const movement =
      await createNewAccountingMovement(result.data);

    res.status(201).json(movement);
  } catch (error) {
    next(error);
  }
}

/**
 * Actualiza un movimiento contable existente.
 */
export async function updateAccountingMovementController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      res.status(400).json({
        message: "ID de movimiento no válido",
      });

      return;
    }

    const result =
      updateAccountingMovementSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Datos de movimiento no válidos",
        errors: result.error.issues,
      });

      return;
    }

    const movement =
      await updateExistingAccountingMovement(
        id,
        result.data
      );

    res.status(200).json(movement);
  } catch (error) {
    next(error);
  }
}

/**
 * Elimina un movimiento contable existente.
 */
export async function deleteAccountingMovementController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      res.status(400).json({
        message: "ID de movimiento no válido",
      });

      return;
    }

    await deleteExistingAccountingMovement(id);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}