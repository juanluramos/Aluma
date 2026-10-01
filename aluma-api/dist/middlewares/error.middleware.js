import { Prisma } from "../generated/prisma/client.js";
import { AppError } from "../errors/app-error.js";
/**
 * Middleware global de manejo de errores.
 *
 * Centraliza:
 * - Errores de negocio mediante AppError.
 * - Errores conocidos de Prisma.
 * - Errores inesperados.
 */
export function errorMiddleware(error, req, res, next) {
    /**
     * Errores controlados de la aplicación.
     */
    if (error instanceof AppError) {
        res.status(error.statusCode).json({
            message: error.message,
            code: error.code,
        });
        return;
    }
    /**
     * Errores conocidos de Prisma.
     */
    if (error instanceof
        Prisma.PrismaClientKnownRequestError) {
        /**
         * P2002:
         * Restricción UNIQUE incumplida.
         */
        if (error.code === "P2002") {
            res.status(409).json({
                message: "Ya existe un registro con esos datos",
                code: "DUPLICATE_RESOURCE",
            });
            return;
        }
        /**
         * P2003:
         * Restricción de clave foránea.
         */
        if (error.code === "P2003") {
            res.status(409).json({
                message: "La operación incumple una relación entre datos",
                code: "FOREIGN_KEY_CONSTRAINT",
            });
            return;
        }
        /**
         * P2025:
         * Registro no encontrado.
         */
        if (error.code === "P2025") {
            res.status(404).json({
                message: "El recurso solicitado no existe",
                code: "RESOURCE_NOT_FOUND",
            });
            return;
        }
    }
    /**
     * Error inesperado.
     *
     * Lo registramos en consola para poder
     * diagnosticarlo, pero no enviamos detalles
     * internos al cliente.
     */
    console.error("Error no controlado:", error);
    res.status(500).json({
        message: "Error interno del servidor",
        code: "INTERNAL_SERVER_ERROR",
    });
}
//# sourceMappingURL=error.middleware.js.map