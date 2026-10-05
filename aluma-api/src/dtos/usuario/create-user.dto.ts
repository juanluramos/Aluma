import {z} from 'zod';

/**
 * Esquema de validación para la creación de un nuevo usuario.
 * 
 * Define que campos puede recibir la API
 * cuáles son obligatorios y qué formato deben tener.
 */

export const createUserSchema = z.object({
    codUsuario: z
        .string()
        .trim()
        .max(10)
        .optional(),

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
        
    email: z
        .email()
        .max(254),

    telefono: z
        .string()
        .trim()
        .max(15)
        .optional(),

    id_rol: z
        .number()
        .int()
        .positive().max(2147483647),

    socio: z
        .boolean(),

    id_estado_usuario: z
        .number()
        .int()
        .positive().max(2147483647),

    matriculaPagada: z
        .boolean(),

    comentario: z
        .string()
        .trim()        
        .max(500)
        .optional(),
});

/**
 * Tipo TypesScript generado automáticamente a partir del esquema de validación.
 */

export type CreateUserDto = z.infer<typeof createUserSchema>;