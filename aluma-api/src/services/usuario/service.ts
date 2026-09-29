import {getAllUsers, getUserById, createUser, updateUser, deleteUser} from "../../repositories/usuario/repository.js";
import type {CreateUserDto} from "../../dtos/usuario/create-user.dto.js";
import type {UpdateUserDto} from "../../dtos/usuario/update-user.dto.js";
import { AppError } from "../../errors/app-error.js";

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

export async function createNewUser(data: CreateUserDto) {
    return createUser(data);
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
 * Si no existe, getUser() lanzará un AppError.
 *
 * @param id - El ID del usuario a actualizar.
 * @param data - Datos del usuario que se van a actualizar.
 * @returns El usuario actualizado.
 */
export async function updateExistingUser(
  id: number,
  data: UpdateUserDto
) {
  await getUser(id);

  return updateUser(id, data);
}

/**
 * Elimina un usuario existente.
 *
 * Comprueba primero que el usuario exista.
 * Si no existe, getUser() lanzará un AppError.
 *
 * @param id - El ID del usuario a eliminar.
 * @returns El usuario eliminado.
 */
export async function deleteExistingUser(id: number) {
  await getUser(id);

  return deleteUser(id);
}