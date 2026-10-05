import { z } from "zod";
/**
 * Esquema de validación para el registro de un usuario
 * mediante un proveedor OAuth.
 *
 * Los datos de identidad proporcionados por Google
 * no se reciben aquí desde el cliente. Se obtendrán
 * del proceso OAuth ya validado.
 */
export const oauthRegisterSchema = z.strictObject({
    id_tipo_documento: z
        .number()
        .int()
        .positive().max(2147483647),
    numeroDocumento: z
        .string()
        .trim()
        .min(1)
        .max(20),
    nombre: z
        .string()
        .trim()
        .min(1)
        .max(50),
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
    telefono: z
        .string()
        .trim()
        .max(15)
        .optional(),
    socio: z
        .boolean(),
});
//# sourceMappingURL=oauth-register.dto.js.map