import type { NextFunction, Request, Response } from "express";
import { prisma } from "../../config/prisma.js";

/** Un operador solo da de alta el rol Usuario, activo o inactivo. Socio y matrícula sí puede marcarlos. */
export function operadorPuedeDarDeAlta(datos: {
  nombreRol: string | undefined;
  nombreEstado: string | undefined;
  socio: boolean;
  matriculaPagada: boolean;
}): boolean {
  return datos.nombreRol === "Usuario"
    && (datos.nombreEstado === "Activo" || datos.nombreEstado === "Inactivo");
}

/**
 * Un operador puede dar de alta cuentas de Usuario activas o inactivas, y marcar socio y matrícula.
 * El administrador elige además el rol y el estado Pendiente.
 */
export async function authorizeUserCreate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        message: "Usuario no autenticado",
        code: "AUTHENTICATION_REQUIRED",
      });
      return;
    }

    if (req.user.rol === "Administrador") {
      next();
      return;
    }

    if (req.user.rol !== "Operador") {
      res.status(403).json({
        message: "No tienes permisos para crear usuarios",
        code: "FORBIDDEN",
      });
      return;
    }

    const body = req.body ?? {};
    const [rol, estado] = await Promise.all([
      prisma.rolUsuario.findUnique({ where: { id_rol: body.id_rol } }),
      prisma.estadoUsuario.findUnique({ where: { id_estado_usuario: body.id_estado_usuario } }),
    ]);

    if (!operadorPuedeDarDeAlta({
      nombreRol: rol?.nombre_rol,
      nombreEstado: estado?.nombre_estado,
      socio: body.socio,
      matriculaPagada: body.matriculaPagada,
    })) {
      res.status(403).json({
        message: "No tienes permisos para asignar el rol o el estado",
        code: "FORBIDDEN_FIELDS",
      });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}
