import { getUsers, getUser, createNewUser, updateExistingUser, deleteExistingUser, } from "../../services/usuario/service.js";
import { AppError } from "../../errors/app-error.js";
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
export async function getAllUsersController(_req, res, next) {
    try {
        const users = await getUsers();
        res.status(200).json(users);
    }
    catch (error) {
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
export async function getUserByIdController(req, res, next) {
    try {
        const id = Number(req.params.id);
        /**
         * Comprobamos que el ID sea válido.
         */
        if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
            res.status(400).json({
                message: "ID de usuario inválido",
                code: "INVALID_ID",
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
    }
    catch (error) {
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
export async function createUserController(req, res, next) {
    try {
        if (!req.user) {
            throw new AppError("Usuario no autenticado", 401, "AUTHENTICATION_REQUIRED");
        }
        const user = await createNewUser(req.body, {
            requestId: req.requestId,
            id_usuario: req.user.id_usuario,
            rol_actor: req.user.rol,
        });
        res.status(201).json(user);
    }
    catch (error) {
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
export async function updateUserController(req, res, next) {
    try {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
            res.status(400).json({
                message: "ID no válido",
                code: "INVALID_ID",
            });
            return;
        }
        if (!req.user) {
            throw new AppError("Usuario no autenticado", 401, "AUTHENTICATION_REQUIRED");
        }
        const user = await updateExistingUser(id, req.body, {
            requestId: req.requestId,
            id_usuario: req.user.id_usuario,
            rol_actor: req.user.rol,
        });
        res.status(200).json(user);
    }
    catch (error) {
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
export async function deleteUserController(req, res, next) {
    try {
        const id = Number(req.params.id);
        /**
         * Comprobamos que el ID sea válido.
         */
        if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
            res.status(400).json({
                message: "ID de usuario inválido",
                code: "INVALID_ID",
            });
            return;
        }
        /**
         * Delegamos la eliminación al Service.
         *
         * El Service comprobará que el usuario exista
         * antes de eliminarlo.
         */
        if (!req.user) {
            throw new AppError("Usuario no autenticado", 401, "AUTHENTICATION_REQUIRED");
        }
        await deleteExistingUser(id, {
            requestId: req.requestId,
            id_usuario: req.user.id_usuario,
            rol_actor: req.user.rol,
        });
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=controller.js.map