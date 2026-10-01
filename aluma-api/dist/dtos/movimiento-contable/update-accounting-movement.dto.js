import { z } from "zod";
export const updateAccountingMovementSchema = z
    .object({
    id_tipo_movimiento: z.number().int().positive().optional(),
    concepto: z.string().trim().min(1).max(25).optional(),
    importe: z.number().optional(),
    fecha: z.coerce.date().optional(),
    id_inscripcion: z.number().int().positive().nullable().optional(),
    comentario: z.string().trim().nullable().optional(),
})
    .refine((data) => Object.keys(data).length > 0, {
    message: "Debe indicarse al menos un campo para actualizar",
});
//# sourceMappingURL=update-accounting-movement.dto.js.map