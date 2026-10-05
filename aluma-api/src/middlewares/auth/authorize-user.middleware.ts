import type { NextFunction, Request, Response } from "express";

/**
 * Comprueba que el usuario pueda consultar el usuario
 * indicado en req.params.id.
 *
 * Administradores y operadores pueden consultar cualquier usuario.
 * Un usuario normal solamente puede consultar sus propios datos.
 */
export function authorizeUserAccess(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({
      message: "Usuario no autenticado",
      code: "AUTHENTICATION_REQUIRED",
    });

    return;
  }

  const requestedUserId = Number(req.params.id);

  if (!Number.isSafeInteger(requestedUserId) || requestedUserId <= 0 || requestedUserId > 2147483647) {
    res.status(400).json({
      message: "ID de usuario inválido",
      code: "INVALID_ID",
    });

    return;
  }

  if (
    req.user.rol === "Administrador" ||
    req.user.rol === "Operador"
  ) {
    next();
    return;
  }

  if (
    req.user.rol === "Usuario" &&
    req.user.id_usuario === requestedUserId
  ) {
    next();
    return;
  }

  res.status(403).json({
    message: "No tienes permisos para consultar este usuario",
    code: "FORBIDDEN",
  });
}