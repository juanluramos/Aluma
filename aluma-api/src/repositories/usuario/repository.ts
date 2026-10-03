import {prisma} from "../../config/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type {CreateUserDto} from "../../dtos/usuario/create-user.dto.js";
import type {UpdateUserDto} from "../../dtos/usuario/update-user.dto.js";


/**
 * Obtiene todos los usuarios almacenados en la base de datos.
 *
 * @returns Lista completa de usuarios.
 */

export async function getAllUsers() {
    return prisma.usuario.findMany();
}

/**
 * Busca un usuario por su ID.
 * @returns El usuario encontrado o null si no existe.
 */

export async function getUserById(id: number, client: Prisma.TransactionClient = prisma) {
    return client.usuario.findUnique({
        where: { 
            id_usuario: id },
    });
}


/**
 * Crea un nuevo usuario en la base de datos.
 * 
 * Los campos opcionales solo se envían a Prisma cuando realmente tienen un valor.
 * 
 * @param data Datos del usuario.
 * @returns El usuario creado.
 */

export async function createUser(data: CreateUserDto, client: Prisma.TransactionClient = prisma) {
    return client.usuario.create({
        data: {
            id_tipo_documento: data.id_tipo_documento,
            numeroDocumento: data.numeroDocumento,
            nombre: data.nombre,
            email: data.email,
            id_rol: data.id_rol,
            socio: data.socio,
            matriculaPagada: data.matriculaPagada,
            id_estado_usuario: data.id_estado_usuario,
            ...(data.codUsuario !== undefined && {
                codUsuario: data.codUsuario,
                }),
            ...(data.apellido1 !== undefined && {
                 apellido1: data.apellido1 
                }),
            ...(data.apellido2 !== undefined && {
                 apellido2: data.apellido2 
                }),
            ...(data.telefono !== undefined && {
                 telefono: data.telefono
                }),
            ...(data.comentario !== undefined && {
                 comentario: data.comentario 
                }),
        },
    });
}

/**
 * Datos permitidos para actualizar un usuario.
 * Todos los campos son opcionales porque en una actualizacion
 * no es obligatorio modificar todos los datos.
 */

export interface UpdateUserData {
    codUsuario?: string;
    id_tipo_documento?: number;
    numeroDocumento?: string;
    nombre?: string;
    apellido1?: string;
    apellido2?: string;
    email?: string;
    telefono?: string;
    id_rol?: number;
    socio?: boolean;
    id_estado_usuario?: number;
    matriculaPagada?: boolean;
    comentario?: string;
}

/**
 * Actualiza un usuario existente en la base de datos.
 * 
 * @param id ID del usuario a actualizar.
 * @param data Datos a actualizar.
 * @returns El usuario actualizado.
 */

/**
 * Actualiza un usuario existente.
 *
 * Solo se envían a Prisma los campos
 * que realmente tienen un valor.
 *
 * @param id Identificador del usuario.
 * @param data Datos a actualizar.
 * @returns Usuario actualizado.
 */
export async function updateUser(
  id: number,
  data: UpdateUserDto,
  client: Prisma.TransactionClient = prisma
) {
  return client.usuario.update({
    where: {
      id_usuario: id,
    },

    data: {
      ...(data.codUsuario !== undefined && {
        codUsuario: data.codUsuario,
      }),

      ...(data.id_tipo_documento !== undefined && {
        id_tipo_documento: data.id_tipo_documento,
      }),

      ...(data.numeroDocumento !== undefined && {
        numeroDocumento: data.numeroDocumento,
      }),

      ...(data.nombre !== undefined && {
        nombre: data.nombre,
      }),

      ...(data.apellido1 !== undefined && {
        apellido1: data.apellido1,
      }),

      ...(data.apellido2 !== undefined && {
        apellido2: data.apellido2,
      }),

      ...(data.email !== undefined && {
        email: data.email,
      }),

      ...(data.telefono !== undefined && {
        telefono: data.telefono,
      }),

      ...(data.id_rol !== undefined && {
        id_rol: data.id_rol,
      }),

      ...(data.socio !== undefined && {
        socio: data.socio,
      }),

      ...(data.id_estado_usuario !== undefined && {
        id_estado_usuario: data.id_estado_usuario,
      }),

      ...(data.matriculaPagada !== undefined && {
        matriculaPagada: data.matriculaPagada,
      }),

      ...(data.comentario !== undefined && {
        comentario: data.comentario,
      }),
    },
  });
}

/**
 * Elimina un usuario de la base de datos.
 * @param id ID del usuario a eliminar.
 * @returns El usuario eliminado.
 */
export async function deleteUser(id: number, client: Prisma.TransactionClient = prisma) {
    return client.usuario.delete({
        where: {
            id_usuario: id
        }
    });
}
