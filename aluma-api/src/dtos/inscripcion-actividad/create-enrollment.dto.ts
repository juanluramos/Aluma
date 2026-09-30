import { z } from "zod";

/**
 * Esquema de validación para crear
 * una inscripción a una actividad.
 */
export const createEnrollmentSchema = z.object({
  /**
   * Usuario que se inscribe.
   */
  id_usuario: z
    .number()
    .int()
    .positive(),

  /**
   * Actividad a la que se inscribe.
   */
  id_actividad: z
    .number()
    .int()
    .positive(),

  /**
   * Precio aplicado a la inscripción.
   */
  precioAplicado: z
    .number()
    .nonnegative()
    .nullable()
    .optional(),

  /**
   * Estado del pago.
   */
  id_estado_pago: z
    .number()
    .int()
    .positive(),

  /**
   * Método de pago.
   *
   * Puede ser null mientras la inscripción
   * todavía no esté pagada.
   */
  id_metodo_pago: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional(),

  /**
   * Fecha en la que el usuario se apunta.
   */
  apuntadoFecha: z
    .coerce
    .date(),

  /**
   * Fecha en la que se realiza el pago.
   */
  fechaPago: z
    .coerce
    .date()
    .nullable()
    .optional(),

  /**
   * Comentario opcional.
   */
  comentario: z
    .string()
    .trim()
    .nullable()
    .optional(),
});

/**
 * Tipo TypeScript generado a partir
 * del esquema de Zod.
 */
export type CreateEnrollmentDto =
  z.infer<typeof createEnrollmentSchema>;