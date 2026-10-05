import { z } from "zod";

/**
 * Esquema de validación para actualizar un usuario.
 *
 * Todos los campos son opcionales porque
 * no es obligatorio modificar todos los datos.
 */
export const updateUserSchema = z.object({
  codUsuario: z
    .string()
    .trim()
    .max(10)
    .optional(),

  id_tipo_documento: z
    .number()
    .int()
    .positive().max(2147483647)
    .optional(),

  numeroDocumento: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .optional(),

  nombre: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .optional(),

  apellido1: z
    .string()
    .trim()
    .max(50)
    .optional(),

  apellido2: z
    .string()
    .trim()
    .max(50)
    .optional(),

  email: z
    .email()
    .max(254)
    .optional(),

  telefono: z
    .string()
    .trim()
    .max(15)
    .optional(),

  id_rol: z
    .number()
    .int()
    .positive().max(2147483647)
    .optional(),

  socio: z
    .boolean()
    .optional(),

  id_estado_usuario: z
    .number()
    .int()
    .positive().max(2147483647)
    .optional(),

  matriculaPagada: z
    .boolean()
    .optional(),

  comentario: z
    .string()
    .trim()
    .max(500)
    .optional(),
})

.refine(
    (data) => Object.keys(data).length > 0,
    {
      message: "Debe indicarse al menos un campo para actualizar",
    }
  );
/**
 * Tipo TypeScript generado automáticamente
 * a partir del esquema de validación.
 */
export type UpdateUserDto =
  z.infer<typeof updateUserSchema>;