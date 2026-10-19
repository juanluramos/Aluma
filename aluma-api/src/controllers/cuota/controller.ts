import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../errors/app-error.js";
import {
  createNewCuota,
  deleteExistingCuota,
  getCuota,
  getCuotas,
  getCuotasDeUsuario,
  updateExistingCuota,
} from "../../services/cuota/service.js";

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

export async function getAllCuotasController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.status(200).json(await getCuotas());
  } catch (error) {
    next(error);
  }
}

export async function getCuotaByIdController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = idEntero(req.params.id);
    if (id === null) {
      res.status(400).json({ message: "ID de cuota no válido", code: "INVALID_ID" });
      return;
    }
    res.status(200).json(await getCuota(id));
  } catch (error) {
    next(error);
  }
}

export async function getCuotasByUsuarioController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const idUsuario = idEntero(req.params.idUsuario);
    if (idUsuario === null) {
      res.status(400).json({ message: "ID de usuario no válido", code: "INVALID_ID" });
      return;
    }
    res.status(200).json(await getCuotasDeUsuario(idUsuario));
  } catch (error) {
    next(error);
  }
}

export async function createCuotaController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.status(201).json(await createNewCuota(req.body, exigirActor(req)));
  } catch (error) {
    next(error);
  }
}

export async function updateCuotaController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = idEntero(req.params.id);
    if (id === null) {
      res.status(400).json({ message: "ID de cuota no válido", code: "INVALID_ID" });
      return;
    }
    res.status(200).json(await updateExistingCuota(id, req.body, exigirActor(req)));
  } catch (error) {
    next(error);
  }
}

export async function deleteCuotaController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = idEntero(req.params.id);
    if (id === null) {
      res.status(400).json({ message: "ID de cuota no válido", code: "INVALID_ID" });
      return;
    }
    await deleteExistingCuota(id, exigirActor(req));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
