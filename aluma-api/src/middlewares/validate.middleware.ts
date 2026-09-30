import type {
  Request,
  Response,
  NextFunction,
} from "express";

import type {
  ZodType,
} from "zod";


/**
 * Middleware genérico para validar req.body
 * utilizando un esquema de Zod.
 *
 * @param schema - Esquema Zod que debe cumplir el body.
 */
export function validateBody(
  schema: ZodType
) {
  return (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const result =
      schema.safeParse(req.body);

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

