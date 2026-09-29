import type { Request, Response } from 'express';
import { getUsers, getUser, createNewUser, updateExistingUser, deleteExistingUser} from '../../services/usuario/service.js';
import { createUserSchema } from "../../dtos/usuario/create-user.dto.js";


/**
 * Devuelve todos los usuarios.
 *
 * Gestiona la petición HTTP y delega la lógica
 * de negocio en el servicio de usuarios.
 *
 * @param _req Petición HTTP.
 * @param res Respuesta HTTP.
 */

export async function getAllUsersController(_req: Request, res: Response): Promise<void> {
  try {
    const users = await getUsers();
    res.status(200).json(users);
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
    });
  }
}

/**
 * Devuelve un usuario por su ID.
 *
 * @param req Petición HTTP.
 * @param res Respuesta HTTP.
 */

export async function getUserByIdController(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    const user = await getUser(id);

    if (!user) {
      res.status(404).json({
        message: 'Usuario no encontrado',
      });

      return;
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('Error al obtener usuario:', error);

    res.status(500).json({
      message: 'Error interno del servidor',
    });
  }
}

/**
 * Crea un nuevo usuario.
 *
 * Recibe los datos del usuario mediante req.body,
 * comprueba que los campos obligatorios estén presentes
 * y delega la creación en el service.
 *
 * @param req Petición HTTP.
 * @param res Respuesta HTTP.
 */
export async function createUserController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const result = createUserSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Datos de usuario no válidos",
        errors: result.error.issues,
      });

      return;
    }

    const user = await createNewUser(result.data);

    res.status(201).json(user);
  } catch (error) {
    console.error("Error al crear usuario:", error);

    res.status(500).json({
      message: "Error interno del servidor",
    });
  }
}

/**
 * Actualiza un usuario existente.
 *
 * Recibe los datos a actualizar mediante req.body,
 * comprueba que el usuario exista y delega la actualización
 * en el service.
 *
 * @param req Petición HTTP.
 * @param res Respuesta HTTP.
 */

export async function updateUserController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = Number(req.params.id);
    
    /**
     * Comprobamos que el id sea válido
     */
    if(Number.isNaN(id)) {
      res.status(400).json({
        message: "ID de usuario inválido",
      });

      return;
    }
    /**
     * Comprobamos que el usuario exista
     */

    const existingUser = await getUser(id);

    if (!existingUser) {
      res.status(404).json({
        message: "Usuario no encontrado",
      });

      return;
    }

    /**
     * Datos enviados por el cliente
     */
    const data = req.body;

    /**
     * Actualizamos el usuario
     */

    const updatedUser = await updateExistingUser(id, data);

    res.status(200).json(updatedUser);
    } catch (error) {
      console.error("Error al actualizar usuario:", error);

      res.status(500).json({
        message: "Error interno del servidor",
      });
    }
  }

/**
 * Elimina un usuario existente.
 *
 * @param req Petición HTTP.
 * @param res Respuesta HTTP.
 */
export async function deleteUserController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      res.status(400).json({
        message: "ID de usuario inválido",
      });

      return;
    }

    const existingUser = await getUser(id);

    if (!existingUser) {
      res.status(404).json({
        message: "Usuario no encontrado",
      });

      return;
    }

    await deleteExistingUser(id);

    res.status(204).send();
    } catch (error) {
      console.error("Error al eliminar usuario:", error);

      res.status(500).json({
        message: "Error interno del servidor",
      });
    }
}
