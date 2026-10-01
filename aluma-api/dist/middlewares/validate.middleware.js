/**
 * Middleware genérico para validar req.body
 * utilizando un esquema de Zod.
 *
 * @param schema - Esquema Zod que debe cumplir el body.
 */
export function validateBody(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({
                message: "Datos no válidos",
                code: "VALIDATION_ERROR",
                errors: result.error.issues,
            });
            return;
        }
        /**
         * Sustituimos req.body por los datos
         * ya procesados y validados por Zod.
         *
         * Esto también aplica transformaciones
         * como z.coerce.date().
         */
        req.body = result.data;
        next();
    };
}
//# sourceMappingURL=validate.middleware.js.map