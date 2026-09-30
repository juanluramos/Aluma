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
        code: "INVALID_ID",
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
    const movement =
      await createNewAccountingMovement(req.body);

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
        message: "ID no válido",
        code: "INVALID_ID",
      });

      return;
    }

    const movement =
      await updateExistingAccountingMovement(
        id,
        req.body
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
        code: "INVALID_ID",
      });

      return;
    }

    await deleteExistingAccountingMovement(id);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}