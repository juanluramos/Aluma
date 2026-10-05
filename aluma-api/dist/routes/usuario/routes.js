import { Router } from "express";
import { getAllUsersController, getUserByIdController, createUserController, updateUserController, deleteUserController, } from "../../controllers/usuario/controller.js";
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
 * GET /api/usuarios
 *
 * Devuelve todos los usuarios.
 *
 * Acceso:
 * - Operador
 * - Administrador
 */
router.get("/", authenticate, authorize("Operador", "Administrador"), getAllUsersController);
/**
 * GET /api/usuarios/:id
 *
 * Devuelve un usuario por su ID.
 *
 * El acceso se controla mediante authorizeUserAccess.
 */
router.get("/:id", authenticate, authorizeUserAccess, getUserByIdController);
/**
 * POST /api/usuarios
 *
 * Crea un nuevo usuario.
 *
 * Acceso:
 * - Operador
 * - Administrador
 */
router.post("/", authenticate, authorize("Operador", "Administrador"), validateBody(createUserSchema), createUserController);
/**
 * PUT /api/usuarios/:id
 *
 * Actualiza un usuario existente.
 *
 * Se comprueba:
 * 1. Que esté autenticado.
 * 2. Que tenga acceso al usuario.
 * 3. Que los campos modificados estén permitidos.
 * 4. Que los datos cumplan el esquema de validación.
 */
router.put("/:id", authenticate, authorizeUserAccess, authorizeUserUpdate, validateBody(updateUserSchema), updateUserController);
/**
 * DELETE /api/usuarios/:id
 *
 * Elimina un usuario existente.
 *
 * Acceso:
 * - Administrador
 */
router.delete("/:id", authenticate, authorize("Administrador"), deleteUserController);
export default router;
//# sourceMappingURL=routes.js.map