import type {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  getUsers,
  getUser,
  createNewUser,
  updateExistingUser,
  deleteExistingUser,
} from "../../services/usuario/service.js";

import { createUserSchema } from "../../dtos/usuario/create-user.dto.js";
import { updateUserSchema } from "../../dtos/usuario/update-user.dto.js";

/**
 * Devuelve todos los usuarios.
 *
 * Gestiona la petición HTTP y delega la lógica
 * de negocio en el servicio de usuarios.
 *
 * @param _req Petición HTTP.
 * @param res Respuesta HTTP.
 * @param next Función que envía los errores al middleware global.
 */
export async function getAllUsersController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const users = await getUsers();

    res.status(200).json(users);
  } catch (error) {
    next(error);
  }
}

/**
 * Devuelve un usuario por su ID.
 *
 * @param req Petición HTTP.
 * @param res Respuesta HTTP.
 * @param next Función que envía los errores al middleware global.
 */
export async function getUserByIdController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Number(req.params.id);

    /**
     * Comprobamos que el ID sea válido.
     */
    if (Number.isNaN(id)) {
      res.status(400).json({
        message: "ID de usuario inválido",
      });

      return;
    }

    /**
     * Buscamos el usuario.
     *
     * Si no existe, el Service lanzará un AppError.
     */
    const user = await getUser(id);

    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
}

/**
 * Crea un nuevo usuario.
 *
 * Recibe los datos mediante req.body,
 * los valida con Zod y delega la creación
 * en el Service.
 *
 * @param req Petición HTTP.
 * @param res Respuesta HTTP.
 * @param next Función que envía los errores al middleware global.
 */
export async function createUserController(
  req: Request,
  res: Response,
  next: NextFunction
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
    next(error);
  }
}

/**
 * Actualiza un usuario existente.
 *
 * @param req Petición HTTP.
 * @param res Respuesta HTTP.
 * @param next Función que envía los errores al middleware global.
 */
export async function updateUserController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Number(req.params.id);

    /**
     * Comprobamos que el ID sea válido.
     */
    if (Number.isNaN(id)) {
      res.status(400).json({
        message: "ID de usuario inválido",
      });

      return;
    }


    /**
     * Validamos los datos con Zod.
     */
    const result = updateUserSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Datos de usuario no válidos",
        errors: result.error.issues,
      });

      return;
    }

    /**
 * Delegamos la actualización al Service.
 *
 * El Service comprobará que el usuario exista
 * antes de actualizarlo.
 */
    const updatedUser = await updateExistingUser(
      id,
      result.data
    );

    res.status(200).json(updatedUser);
  } catch (error) {
    next(error);
  }
}

/**
 * Elimina un usuario existente.
 *
 * @param req Petición HTTP.
 * @param res Respuesta HTTP.
 * @param next Función que envía los errores al middleware global.
 */
export async function deleteUserController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Number(req.params.id);

    /**
     * Comprobamos que el ID sea válido.
     */
    if (Number.isNaN(id)) {
      res.status(400).json({
        message: "ID de usuario inválido",
      });

      return;
    }

    /**
     * Delegamos la eliminación al Service.
     *
     * El Service comprobará que el usuario exista
     * antes de eliminarlo.
     */
    await deleteExistingUser(id);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}