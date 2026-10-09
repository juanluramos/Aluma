import {getAllUsers, getUserById, createUser, updateUser, deleteUser} from "../../repositories/usuario/repository.js";
import type {CreateUserDto} from "../../dtos/usuario/create-user.dto.js";
import type {UpdateUserDto} from "../../dtos/usuario/update-user.dto.js";
import { AppError } from "../../errors/app-error.js";
import { prisma } from "../../config/prisma.js";
import { createAudit } from "../auditoria/service.js";
import { getIO } from "../../socket/socket.js";

export interface UserCreationAuditContext {
  requestId: string;
  id_usuario: number;
  rol_actor: string;
}

/**
 * Obtiene todos los usuarios.
 *
 * En esta capa se aplicarán las reglas de negocio
 * relacionadas con los usuarios.
 *
 * @returns Lista de usuarios.
 */

export async function getUsers() {
    return getAllUsers();
}

/**
 * Obtiene un usuario por su ID.
 *
 * @param id - El ID del usuario a buscar.
 * @returns El usuario encontrado o null si no existe.
 */

export async function getUser(id: number) {
    const user = await getUserById(id);

    if (!user) {
        throw new AppError("Usuario no encontrado", 404, "USER_NOT_FOUND");
    }
    return user;
}



/**
 * Crea un nuevo usuario.
 *
 * En esta capa se aplicarán las reglas de negocio
 * relacionadas con la creación de usuarios.
 * 
 * @param data - Datos del nuevo usuario.
 * @returns usuario creado.
 */

export async function createNewUser(
  data: CreateUserDto,
  context: UserCreationAuditContext
) {
  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await createUser(data, tx);

    await createAudit(
      {
        requestId: context.requestId,
        id_usuario: context.id_usuario,
        rol_actor: context.rol_actor,
        accion: "USUARIO_CREADO",
        recurso: "USUARIO",
        id_recurso: createdUser.id_usuario,
        resultado: "REALIZADA",
        codigo_error: null,
        detalles: null,
      },
      tx
    );

    return createdUser;
  });

  getIO().emit("dashboard:update");

  return user;
}
/**
 * Actualiza un usuario existente.
 *
 * En esta capa se aplicarán las reglas de negocio
 * relacionadas con la actualización de usuarios.
 *
 * @param id - El ID del usuario a actualizar.
 * @param data - Datos a actualizar.
 * @returns El usuario actualizado.
 */
/**
 * Actualiza un usuario existente.
 *
 * Comprueba primero que el usuario exista.
 * Si no existe, se lanza un AppError antes de actualizar.
 *
 * @param id - El ID del usuario a actualizar.
 * @param data - Datos del usuario que se van a actualizar.
 * @returns El usuario actualizado.
 */
export async function updateExistingUser(
  id: number,
  data: UpdateUserDto,
  context: UserCreationAuditContext
) {
  const actualizado = await prisma.$transaction(
    async (tx) => {
      const anterior = await getUserById(id, tx);

      if (!anterior) {
        throw new AppError(
          "Usuario no encontrado",
          404,
          "USER_NOT_FOUND"
        );
      }

      const usuarioActualizado = await updateUser(id, data, tx);

      const campos = [
        "codUsuario",
        "id_tipo_documento",
        "numeroDocumento",
        "nombre",
        "apellido1",
        "apellido2",
        "email",
        "telefono",
        "id_rol",
        "socio",
        "id_estado_usuario",
        "matriculaPagada",
        "comentario",
      ] as const satisfies readonly (keyof UpdateUserDto)[];

      const cambios: Record<
        string,
        {
          anterior: string | number | boolean | null;
          nuevo: string | number | boolean | null;
        }
      > = {};

      for (const campo of campos) {
        if (anterior[campo] !== usuarioActualizado[campo]) {
          cambios[campo] = {
            anterior: anterior[campo],
            nuevo: usuarioActualizado[campo],
          };
        }
      }

      if (Object.keys(cambios).length > 0) {
        await createAudit(
          {
            requestId: context.requestId,
            id_usuario: context.id_usuario,
            rol_actor: context.rol_actor,
            accion: "USUARIO_MODIFICADO",
            recurso: "USUARIO",
            id_recurso: usuarioActualizado.id_usuario,
            resultado: "REALIZADA",
            codigo_error: null,
            detalles: { cambios },
          },
          tx
        );
      }

      return usuarioActualizado;
    },
    {
      isolationLevel: "Serializable",
    }
  );

  getIO().emit("dashboard:update");

  return actualizado;
}

/**
 * Elimina un usuario existente.
 *
 * Comprueba primero que el usuario exista.
 * Si no existe, se lanza un AppError antes de eliminar.
 *
 * @param id - El ID del usuario a eliminar.
 * @returns El usuario eliminado.
 */
export async function deleteExistingUser(
  id: number,
  context: UserCreationAuditContext
) {
  const deleted = await prisma.$transaction(async (tx) => {
    const user = await getUserById(id, tx);

    if (!user) {
      throw new AppError(
        "Usuario no encontrado",
        404,
        "USER_NOT_FOUND"
      );
    }

    const deletedUser = await deleteUser(
      user.id_usuario,
      tx
    );

    await createAudit(
      {
        requestId: context.requestId,
        id_usuario: context.id_usuario,
        rol_actor: context.rol_actor,
        accion: "USUARIO_ELIMINADO",
        recurso: "USUARIO",
        id_recurso: user.id_usuario,
        resultado: "REALIZADA",
        codigo_error: null,
        detalles: null,
      },
      tx
    );

    return deletedUser;
  });

  getIO().emit("dashboard:update");

  return deleted;
}
