import type { Request, Response } from "express";
import { registroSchema } from "../../dtos/auth/registro.dto.js";
import { registrarDesdeLogin } from "../../services/auth/registro.service.js";

/**
 * Alta pública desde el login. No abre sesión.
 */
export async function registroController(req: Request, res: Response): Promise<void> {
  const result = registroSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      message: result.error.issues[0]?.message ?? "Datos no válidos",
      code: "VALIDATION_ERROR",
      errors: result.error.issues,
    });
    return;
  }

  await registrarDesdeLogin(result.data, req.requestId);

  res.status(201).json({
    message: "Tu cuenta queda pendiente de revisión. Todavía no puedes iniciar sesión.",
  });
}
