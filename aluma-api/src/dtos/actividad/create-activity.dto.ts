import {z} from "zod";

/**
 * Esquema de validación para crear una actividad.
 * 
 * Define los datos que puede recibir la API
 * al crear una nueva actividad.
 */
export const createActivitySchema = z.object({
    /**
     * Titulo de la actividad.
     * En la base de datos es VARCHAR(100).
     */
    titulo: z
        .string()
        .trim()
        .min(1)
        .max(100),
        
    /**
     * Fecha de celebración de la actividad.
     * Es opcional porque en la base de datos puede ser NULL.
     */
    fecha: z
        .coerce
        .date()
        .nullable()
        .optional(),

    /**
    * Importante para socios
    * Puede ser NULL si todavía no se ha
    * establecido un precio para la actividad.
    */
    importeSocio: z
        .number()
        .nonnegative()
      .max(99999999.99)
      .multipleOf(0.01)
        .nullable()
        .optional(),
        
    /**
     * Importante para no socios
     * 
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
     * Debe hacer referencia a un registro
     * existente en la tabla EstadoActividad.
     */
    id_estado_actividad: z
        .number()
        .int()
        .positive().max(2147483647),
    
    /**
     * Comentario adicional sobre la actividad.
     */
    comentario: z
        .string()
        .trim()
        .nullable()
        .optional(),
});

/**
 * Tipo TypeScript generado automáticamente
 * a partir del esquema de Zod.
 */

export type CreateActivityDto = z.infer<typeof createActivitySchema>;