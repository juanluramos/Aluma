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
import { AppError } from "../../errors/app-error.js";


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

    if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
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
    if (!req.user) {
      throw new AppError("Usuario no autenticado", 401, "AUTHENTICATION_REQUIRED");
    }
    const movement =
      await createNewAccountingMovement(req.body, {
        requestId: req.requestId,
        id_usuario: req.user.id_usuario,
        rol_actor: req.user.rol,
      });

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

    if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
      res.status(400).json({
        message: "ID no válido",
        code: "INVALID_ID",
      });

      return;
    }

    if (!req.user) {
      throw new AppError("Usuario no autenticado", 401, "AUTHENTICATION_REQUIRED");
    }
    const movement =
      await updateExistingAccountingMovement(
        id,
        req.body,
        {
          requestId: req.requestId,
          id_usuario: req.user.id_usuario,
          rol_actor: req.user.rol,
        }
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

    if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
      res.status(400).json({
        message: "ID de movimiento no válido",
        code: "INVALID_ID",
      });

      return;
    }

    if (!req.user) {
      throw new AppError("Usuario no autenticado", 401, "AUTHENTICATION_REQUIRED");
    }
    await deleteExistingAccountingMovement(id, {
      requestId: req.requestId,
      id_usuario: req.user.id_usuario,
      rol_actor: req.user.rol,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
