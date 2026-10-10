import { z } from 'zod';
import { camposUsuario, validarDocumento } from '../../utils/validacionesUsuario.js';

/** Solo se procesan los campos informados; no se añaden valores por defecto. */
export const updateUserSchema = z.object(camposUsuario).partial()
  .superRefine(validarDocumento)
  .refine(data => Object.keys(data).length > 0, {
    message: 'Debe indicarse al menos un campo para actualizar',
  });

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
