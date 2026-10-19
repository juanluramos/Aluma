import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../errors/app-error.js";
import {
  createNewConfiguracionCuota,
  deleteExistingConfiguracionCuota,
  getConfiguracionCuota,
  getConfiguracionesCuota,
  updateExistingConfiguracionCuota,
} from "../../services/configuracion-cuota/service.js";

function idEntero(valor: unknown): number | null {
  if (typeof valor !== "string") return null;
  const id = Number(valor);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) return null;
  return id;
}

function exigirActor(req: Request) {
  if (!req.user) {
    throw new AppError("Usuario no autenticado", 401, "AUTHENTICATION_REQUIRED");
  }
  return {
    requestId: req.requestId,
    id_usuario: req.user.id_usuario,
    rol_actor: req.user.rol,
  };
}

export async function getAllConfiguracionesCuotaController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.status(200).json(await getConfiguracionesCuota());
  } catch (error) {
    next(error);
  }
}

export async function getConfiguracionCuotaByIdController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = idEntero(req.params.id);
    if (id === null) {
      res.status(400).json({ message: "ID de configuración no válido", code: "INVALID_ID" });
      return;
    }
    res.status(200).json(await getConfiguracionCuota(id));
  } catch (error) {
    next(error);
  }
}

export async function createConfiguracionCuotaController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.status(201).json(await createNewConfiguracionCuota(req.body, exigirActor(req)));
  } catch (error) {
    next(error);
  }
}

export async function updateConfiguracionCuotaController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = idEntero(req.params.id);
    if (id === null) {
      res.status(400).json({ message: "ID de configuración no válido", code: "INVALID_ID" });
      return;
    }
    res.status(200).json(await updateExistingConfiguracionCuota(id, req.body, exigirActor(req)));
  } catch (error) {
    next(error);
  }
}

export async function deleteConfiguracionCuotaController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = idEntero(req.params.id);
    if (id === null) {
      res.status(400).json({ message: "ID de configuración no válido", code: "INVALID_ID" });
      return;
    }
    await deleteExistingConfiguracionCuota(id, exigirActor(req));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
