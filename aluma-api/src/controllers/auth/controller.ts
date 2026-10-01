import type { Request, Response } from "express";

import { loginSchema } from "../../dtos/auth/login.dto.js";
import { loginUser } from "../../services/auth/service.js";

/**
 * Controlador para iniciar sesión.
 */
export async function loginController(
  req: Request,
  res: Response
): Promise<void> {
  const result = loginSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      message: "Datos no válidos",
      code: "VALIDATION_ERROR",
      errors: result.error.issues,
    });

    return;
  }

  const { email, password } = result.data;

  const resultLogin = await loginUser(email, password);

  res.status(200).json(resultLogin);
}