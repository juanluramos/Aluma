import { z } from 'zod';
import { camposUsuario, emailOpcionalSchema, fechaInscripcionSchema, passwordUsuarioSchema, tipoDocumentoSchema, validarDocumento, validarEmailDeRol } from '../../utils/validacionesUsuario.js';

const numeroDocumentoOpcional = z.string().trim().toUpperCase()
  .transform(value => value === '' ? null : value)
  .nullable()
  .optional();

/** Validación y normalización de POST antes de llegar al servicio. */
export const createUserSchema = z.object({
  ...camposUsuario,
  email: emailOpcionalSchema,
  id_tipo_documento: tipoDocumentoSchema.nullable().optional(),
  numeroDocumento: numeroDocumentoOpcional,
  fechaInscripcion: fechaInscripcionSchema.optional(),
  // El alta de un Usuario no abre sesión. Operador (2) y Administrador (3) sí.
  password: z.string().optional(),
}).superRefine((data, ctx) => {
  const tipoVacio = data.id_tipo_documento == null;
  const numeroVacio = data.numeroDocumento == null;
  if (tipoVacio !== numeroVacio) {
    ctx.addIssue({
      code: 'custom',
      path: [tipoVacio ? 'id_tipo_documento' : 'numeroDocumento'],
      message: tipoVacio
        ? 'El tipo de documento es obligatorio si indicas un número.'
        : 'El número de documento es obligatorio si indicas un tipo.',
    });
  } else if (!tipoVacio) {
    validarDocumento(data, ctx);
  }
  validarEmailDeRol(data.email, data.id_rol === 2 || data.id_rol === 3, ctx);
  if (data.id_rol === 2 || data.id_rol === 3) {
    const password = passwordUsuarioSchema.safeParse(data.password);
    if (!password.success) {
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: data.password
          ? password.error.issues[0]!.message
          : 'La contraseña es obligatoria para un operador o un administrador.',
      });
    }
  }
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
