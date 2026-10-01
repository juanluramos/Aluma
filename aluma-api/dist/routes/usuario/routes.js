import { Router } from "express";
import { getAllUsersController, getUserByIdController, createUserController, updateUserController, deleteUserController } from "../../controllers/usuario/controller.js";
import { validateBody } from "../../middlewares/validate.middleware.js";
import { createUserSchema } from "../../dtos/usuario/create-user.dto.js";
import { updateUserSchema } from "../../dtos/usuario/update-user.dto.js";
import { authenticate } from "../../middlewares/auth/authenticate.middleware.js";
import { authorize } from "../../middlewares/auth/authorize.middleware.js";
import { authorizeUserAccess } from "../../middlewares/auth/authorize-user.middleware.js";
import { authorizeUserUpdate } from "../../middlewares/auth/authorize-user-update.middleware.js";
/**
 * Router encargado de las rutas relacionadas con usuarios.
*/
const router = Router();
/**
 * Get /api/usuarios
 *
 * / Devuelve todos los usuarios.
 * /:id Devuelve un usuario por su ID.
 *
 */
router.get("/", authenticate, authorize("Operador", "Administrador"), getAllUsersController);
router.get("/:id", authenticate, authorizeUserAccess, getUserByIdController);
/**
 * Post /api/usuarios
 *
 * Crea un nuevo usuario.
 */
router.post("/", authenticate, authorize("Operador", "Administrador"), createUserController);
/**
 * Put /api/usuarios/:id
 *
 * Actualiza un usuario existente.
 */
router.post("/", validateBody(createUserSchema), createUserController);
router.put("/:id", authenticate, authorizeUserAccess, authorizeUserUpdate, updateUserController);
/**
 * DELETE /api/usuarios/:id
 *
 * Elimina un usuario existente.
 */
router.delete("/:id", authenticate, authorize("Administrador"), deleteUserController);
export default router;
//# sourceMappingURL=routes.js.map