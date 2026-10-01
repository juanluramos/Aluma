import type { NextFunction, Request, Response } from "express";

// Se ejecuta despues de authenticate, authorize y validateBody.
export function authorizeEnrollmentCreate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({
      message: "Usuario no autenticado",
      code: "AUTHENTICATION_REQUIRED",
    });
    return;
  }

  if (req.user.rol === "Usuario" && req.body.id_usuario !== req.user.id_usuario) {
    res.status(403).json({
      message: "No puedes crear una inscripcion para otro usuario",
      code: "FORBIDDEN",
    });
    return;
  }

  next();
}
