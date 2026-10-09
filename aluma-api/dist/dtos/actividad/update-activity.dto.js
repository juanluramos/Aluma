import { z } from "zod";
/**
 * Esquema de validación para actualizar una actividad.
 *
 * Todos los campos son opcionales porque permitimos
 * actualizaciones parciales.
 */
export const updateActivitySchema = z
    .object({
    aforo: z.number().int().positive().max(2147483647).optional(),
    /**
     * Título de la actividad.
     */
    titulo: z
        .string()
        .trim()
        .min(1)
        .max(100)
        .optional(),
    /**
     * Fecha de la actividad.
     *
     * Puede ser una fecha válida o null.
     */
    fecha: z
        .coerce
        .date()
        .nullable()
        .optional(),
    /**
     * Importe para socios.
     */
    importeSocio: z
        .number()
        .nonnegative()
        .max(99999999.99)
        .multipleOf(0.01)
        .nullable()
        .optional(),
    /**
     * Importe para no socios.
     */
    importeNoSocio: z
        .number()
        .nonnegative()
        .max(99999999.99)
        .multipleOf(0.01)
        .nullable()
        .optional(),
    /**
     * Estado de la actividad.
     */
    id_estado_actividad: z
        .number()
        .int()
        .positive().max(2147483647)
        .optional(),
    /**
     * Comentario de la actividad.
     */
    comentario: z
        .string()
        .trim()
        .nullable()
        .optional(),
})
    .refine((data) => Object.keys(data).length > 0, {
    message: "Debe indicarse al menos un campo para actualizar",
});
//# sourceMappingURL=update-activity.dto.js.map