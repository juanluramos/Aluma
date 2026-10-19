import { z } from "zod";
import { camposUsuario, passwordUsuarioSchema, validarDocumento } from "../../utils/validacionesUsuario.js";

/** Alta pública desde el login. El estado y el rol los fija el servicio. */
export const registroSchema = z.strictObject({
  id_tipo_documento: camposUsuario.id_tipo_documento,
  numeroDocumento: camposUsuario.numeroDocumento,
  nombre: camposUsuario.nombre,
  apellido1: camposUsuario.apellido1,
  email: camposUsuario.email,
  password: passwordUsuarioSchema,
}).superRefine(validarDocumento);

export type RegistroDto = z.infer<typeof registroSchema>;
