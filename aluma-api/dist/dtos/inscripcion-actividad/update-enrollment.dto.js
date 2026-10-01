import { z } from "zod";
/**
 * Esquema de validación para actualizar
 * una inscripción a una actividad.
 *
 * Todos los campos son opcionales porque
 * permitimos actualizaciones parciales.
 */
export const updateEnrollmentSchema = z
    .strictObject({
    id_usuario: z.number().int().positive().optional(),
    id_actividad: z.number().int().positive().optional(),
    precioAplicado: z
        .number()
        .nonnegative()
        .max(99999999.99)
        .multipleOf(0.01)
        .nullable()
        .optional(),
    id_estado_pago: z
        .number()
        .int()
        .positive()
        .optional(),
    id_estado_inscripcion: z
        .number()
        .int()
        .positive()
        .optional(),
    id_metodo_pago: z
        .number()
        .int()
        .positive()
        .nullable()
        .optional(),
    apuntadoFecha: z.coerce.date().optional(),
    fechaPago: z.coerce.date().nullable().optional(),
    comentario: z
        .string()
        .trim()
        .nullable()
        .optional(),
})
    .refine((data) => Object.keys(data).length > 0, {
    message: "Debe indicarse al menos un campo para actualizar",
});
//# sourceMappingURL=update-enrollment.dto.js.map