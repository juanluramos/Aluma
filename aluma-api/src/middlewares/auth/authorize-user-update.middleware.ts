import type { NextFunction, Request, Response } from "express";

/**
 * Comprueba qué campos puede modificar un usuario.
 *
 * Usuario:
 * - Solo puede modificar sus datos personales.
 *
 * Operador: puede editar datos y los indicadores Activo, socio y matrícula, pero no el rol.
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

  // El rol sigue reservado al administrador. Los checkbox de edición sí los puede cambiar un operador.
  if (req.user.rol === "Operador" && Object.hasOwn(req.body ?? {}, "id_rol")) {
    res.status(403).json({
      message: "No tienes permisos para modificar el rol",
      code: "FORBIDDEN_FIELDS",
    });
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
    "nombre",
    "apellido1",
    "apellido2",
    "email",
    "telefono",
    "password",
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
