import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { Prisma } from "../generated/prisma/client.js";
import { AppError } from "../errors/app-error.js";

/**
 * Middleware global de errores.
 *
 * Recibe los errores que se producen durante
 * la ejecución de la API y devuelve una respuesta
 * HTTP coherente al cliente.
 *
 * @param error Error recibido.
 * @param _req Petición HTTP.
 * @param res Respuesta HTTP.
 * @param _next Siguiente middleware de Express.
 */
export function errorMiddleware(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  /**
   * Errores personalizados de la aplicación.
   *
   * Son errores generados por nuestra propia
   * lógica de negocio mediante AppError.
   */
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      message: error.message,
      code: error.code,
    });

    return;
  }

  /**
   * Error P2002.
   *
   * Se produce cuando intentamos guardar un valor
   * que debe ser único y ya existe.
   *
   * Ejemplos:
   * - numeroDocumento duplicado
   * - codUsuario duplicado
   */
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    res.status(409).json({
      message: "Ya existe un registro con esos datos únicos",
      code: "DUPLICATE_RESOURCE",
    });

    return;
  }

  /**
   * Error P2003.
   *
   * Se produce cuando una clave foránea hace referencia
   * a un registro que no existe.
   *
   * Ejemplos:
   * - id_rol inexistente
   * - id_estado_usuario inexistente
   * - id_tipo_documento inexistente
   */
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003"
  ) {
    res.status(409).json({
      message: "El registro relacionado no existe",
      code: "FOREIGN_KEY_CONSTRAINT",
    });

    return;
  }

  /**
   * Error P2025.
   *
   * Se produce cuando Prisma intenta actualizar
   * o eliminar un registro que no existe.
   */
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  ) {
    res.status(404).json({
      message: "Recurso no encontrado",
      code: "RESOURCE_NOT_FOUND",
    });

    return;
  }

  /**
   * Error no controlado.
   *
   * Cualquier error que no coincida con los casos
   * anteriores llegará aquí.
   *
   * Mostramos el error real en consola para desarrollo,
   * pero no enviamos información interna al cliente.
   */
  console.error("Error no controlado:", error);

  res.status(500).json({
    message: "Error interno del servidor",
    code: "INTERNAL_SERVER_ERROR",
  });
}