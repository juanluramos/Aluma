import { z } from 'zod';

const letrasDocumento = 'TRWAGMYFPDXBNJZSQVHLCKE';
const mensajeCodigo = 'El código de usuario no tiene un formato válido.';
const mensajeTelefono = 'El teléfono no es válido.';
const mensajeEmail = 'El email no es válido.';
const mensajePassword = 'La contraseña no cumple los requisitos de seguridad.';

export const tipoDocumentoSchema = z.number().int().positive().max(2147483647);
export const numeroDocumentoSchema = z.string({ error: 'El número de documento es obligatorio.' }).trim().toUpperCase();

export function validarDocumento(
  data: { id_tipo_documento?: number | undefined; numeroDocumento?: string | undefined },
  ctx: z.RefinementCtx,
) {
  const { id_tipo_documento: tipo, numeroDocumento: numero } = data;
  if (tipo !== undefined && ![1, 2, 3, 4].includes(tipo)) {
    ctx.addIssue({ code: 'custom', path: ['id_tipo_documento'], message: 'El tipo de documento no es válido.' });
    return;
  }
  // In partial updates the service validates the final pair inside its transaction.
  if (tipo === undefined || numero === undefined) return;
  let valido = false;
  let message: string;
  switch (tipo) {
    case 1:
      valido = /^\d{8}[A-Z]$/.test(numero) && letrasDocumento[Number(numero.slice(0, 8)) % 23] === numero[8];
      message = 'El DNI no es válido.';
      break;
    case 2:
      valido = /^[XYZ]\d{7}[A-Z]$/.test(numero)
        && letrasDocumento[Number(String('XYZ'.indexOf(numero[0]!)) + numero.slice(1, 8)) % 23] === numero[8];
      message = 'El NIE no es válido.';
      break;
    case 3:
      valido = /^[A-Z0-9]{5,20}$/.test(numero);
      message = 'El pasaporte no tiene un formato válido.';
      break;
    case 4:
      valido = /^[A-Z0-9-]{5,30}$/.test(numero) && /[A-Z0-9]/.test(numero);
      message = 'El permiso de trabajo no tiene un formato válido.';
      break;
    default:
      return;
  }
  if (!valido) ctx.addIssue({ code: 'custom', path: ['numeroDocumento'], message });
}

export const documentoUsuarioSchema = z.object({
  id_tipo_documento: tipoDocumentoSchema,
  numeroDocumento: numeroDocumentoSchema,
}).superRefine(validarDocumento);

function textoNombre(campo: string, obligatorio: boolean) {
  const message = `${campo} solo puede contener letras, espacios y guiones (máximo 50 caracteres).`;
  return z.string({ error: message }).trim().min(obligatorio ? 1 : 0, `${campo} es obligatorio.`).max(50, message).refine(
    value => value === '' || (/^[\p{L}\p{M} -]+$/u.test(value) && /\p{L}/u.test(value)),
    { message },
  );
}

export const camposUsuario = {
  codUsuario: z.string({ error: mensajeCodigo }).trim().toUpperCase()
    .regex(/^[A-Z0-9_-]{0,10}$/, mensajeCodigo)
    .transform(value => value === '' ? null : value).optional(),
  id_tipo_documento: tipoDocumentoSchema,
  numeroDocumento: numeroDocumentoSchema,
  nombre: textoNombre('El nombre', true),
  apellido1: textoNombre('El primer apellido', false).optional(),
  apellido2: textoNombre('El segundo apellido', false).optional(),
  email: z.string({ error: mensajeEmail }).trim().toLowerCase()
    .pipe(z.email({ error: mensajeEmail }).max(254, mensajeEmail))
    .refine(value => {
      const [local, domain] = value.split('@');
      return !!local && local.length <= 64 && !!domain && domain.split('.').every(label => label.length <= 63);
    }, mensajeEmail),
  telefono: z.string({ error: mensajeTelefono }).transform(value => value.replace(/\s/g, ''))
    // Móviles (6, 71–79) y fijos geográficos (81–88, 91–98), como en el frontend.
    .refine(value => value === '' || /^(?:\+34)?(?:6\d|7[1-9]|[89][1-8])\d{7}$/.test(value), mensajeTelefono).optional(),
  id_rol: z.number().int().positive().max(2147483647),
  socio: z.boolean(),
  id_estado_usuario: z.number().int().positive().max(2147483647),
  matriculaPagada: z.boolean(),
  comentario: z.string().trim().max(500, 'Los comentarios no pueden superar los 500 caracteres.').optional(),
};

// Do not trim/normalize secrets. Reject bcrypt's truncation boundary in bytes.
export const passwordUsuarioSchema = z.string({ error: mensajePassword }).refine(value =>
  value.length >= 8 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value)
  && Buffer.byteLength(value, 'utf8') <= 72,
{ message: mensajePassword });
