import { z } from "zod";
import { tipoDocumentoSchema, numeroDocumentoSchema, validarDocumento } from "../../utils/validacionesUsuario.js";

/**
 * Esquema de validación para el registro de un usuario
 * mediante un proveedor OAuth.
 *
 * Los datos de identidad proporcionados por Google
 * no se reciben aquí desde el cliente. Se obtendrán
 * del proceso OAuth ya validado.
 */
export const oauthRegisterSchema = z.strictObject({
  id_tipo_documento: tipoDocumentoSchema,

  // SolicitudAlta conserva su límite actual de almacenamiento (20).
  numeroDocumento: numeroDocumentoSchema.max(20),

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


}).superRefine(validarDocumento);

/**
 * Tipo TypeScript generado a partir
 * del esquema de validación.
 */
export type OAuthRegisterDto = z.infer<
  typeof oauthRegisterSchema
>;