import type { NextFunction, Request, Response } from "express";

/**
 * Comprueba qué campos puede modificar un usuario.
 *
 * Usuario:
 * - Solo puede modificar sus datos personales.
 *
 * Operador: puede editar datos, pero no estado ni rol.
 * Administrador: puede modificar todos los campos permitidos por el DTO.
 */
export function authorizeUserUpdate(
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

  // Evita cambios de estado y escalada de privilegios mediante edición del rol.
  if (req.user.rol === "Operador" &&
      ["id_estado_usuario", "id_rol"].some(field => Object.hasOwn(req.body ?? {}, field))) {
    res.status(403).json({ message: "No tienes permisos para modificar el estado o rol", code: "FORBIDDEN_FIELDS" });
    return;
  }

  if (
    req.user.rol === "Operador" ||
    req.user.rol === "Administrador"
  ) {
    next();
    return;
  }

  const allowedFields = [
    "codUsuario",
    "nombre",
    "apellido1",
    "apellido2",
    "email",
    "telefono",
  ];

  // Dejar que Zod responda 400 ante un body ausente o no válido.
  const requestedFields = Object.keys(req.body ?? {});

  const hasForbiddenField = requestedFields.some(
    (field) => !allowedFields.includes(field)
  );

  if (hasForbiddenField) {
    res.status(403).json({
      message: "No tienes permisos para modificar uno o más campos",
      code: "FORBIDDEN_FIELDS",
    });

    return;
  }

  next();
}