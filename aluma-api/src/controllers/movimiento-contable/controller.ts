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
import { interpretarConsulta } from "../../services/contabilidad/filtros.js";
import { listarMovimientosContables } from "../../services/contabilidad/service.js";


/**
 * Devuelve los movimientos contables.
 * Sin parámetros conserva el listado completo. Con filtros, devuelve la página pedida.
 */
export async function getAllAccountingMovementsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const consulta = interpretarConsulta(req.query as Record<string, unknown>);
  if ("error" in consulta) {
    res.status(400).json({ message: consulta.error });
    return;
  }
  try {
    if ("vacia" in consulta) {
      res.status(200).json(await getAccountingMovements());
      return;
    }
    res.status(200).json(await listarMovimientosContables(consulta.filtro, consulta.rango));
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
