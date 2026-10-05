import { z } from "zod";
export const createAccountingMovementSchema = z.object({
    id_tipo_movimiento: z.number().int().positive().max(2147483647),
    concepto: z.string().trim().min(1).max(25),
    importe: z.number().min(-99999999.99).max(99999999.99).multipleOf(0.01),
    fecha: z.union([z.string().min(1), z.date()]).pipe(z.coerce.date()),
    id_inscripcion: z.number().int().positive().max(2147483647).nullable().optional(),
    comentario: z.string().trim().nullable().optional(),
});
//# sourceMappingURL=create-accounting-movement.dto.js.map