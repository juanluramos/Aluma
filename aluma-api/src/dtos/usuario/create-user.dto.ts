import { z } from 'zod';
import { camposUsuario, passwordUsuarioSchema, validarDocumento } from '../../utils/validacionesUsuario.js';

/** Validación y normalización de POST antes de llegar al servicio. */
export const createUserSchema = z.object({
  ...camposUsuario,
  // Sin contraseña se mantiene el alta de usuario sin cuenta local.
  password: passwordUsuarioSchema.optional(),
}).superRefine(validarDocumento);

export type CreateUserDto = z.infer<typeof createUserSchema>;
