import {Router} from "express";
import {getAllUsersController,getUserByIdController,
     createUserController, updateUserController, deleteUserController
    } from "../../controllers/usuario/controller.js";
import { validateBody } from "../../middlewares/validate.middleware.js";

import {
  createUserSchema,
} from "../../dtos/usuario/create-user.dto.js";

import {
  updateUserSchema,
} from "../../dtos/usuario/update-user.dto.js";

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
router.get("/", getAllUsersController);
router.get("/:id", getUserByIdController);

/**
 * Post /api/usuarios
 * 
 * Crea un nuevo usuario.
 */
router.post("/", validateBody(createUserSchema), createUserController);

/**
 * Put /api/usuarios/:id
 * 
 * Actualiza un usuario existente.
 */

router.post(
  "/",
  validateBody(createUserSchema),
  createUserController
);

router.put("/:id", validateBody(updateUserSchema), updateUserController);

/**
 * DELETE /api/usuarios/:id
 * 
 * Elimina un usuario existente.    
 */

router.delete("/:id", deleteUserController);

export default router;