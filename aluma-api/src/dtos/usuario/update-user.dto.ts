import { z } from 'zod';
import { camposUsuario, emailOpcionalSchema, passwordUsuarioSchema, tipoDocumentoSchema, validarDocumento, validarEmailDeRol } from '../../utils/validacionesUsuario.js';

/** Solo se procesan los campos informados; no se añaden valores por defecto. */
export const updateUserSchema = z.object({
  ...camposUsuario,
  email: emailOpcionalSchema,
  id_tipo_documento: tipoDocumentoSchema.nullable(),
  numeroDocumento: z.string().trim().toUpperCase().transform(value => value === '' ? null : value).nullable(),
  password: z.string().optional(),
}).partial()
  .superRefine(validarDocumento)
  .superRefine((data, ctx) => {
    if (data.email !== undefined) validarEmailDeRol(data.email, false, ctx);
    if (!data.password) return;
    const password = passwordUsuarioSchema.safeParse(data.password);
    if (!password.success) {
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: password.error.issues[0]!.message,
      });
    }
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'Debe indicarse al menos un campo para actualizar',
  });

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
