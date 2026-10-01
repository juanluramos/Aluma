import type { Request, Response } from "express";

/**
 * Devuelve la información contenida en el JWT.
 */
export function getMeController(
  req: Request,
  res: Response
): void {
  res.status(200).json({
    id_usuario: req.user?.id_usuario,
    rol: req.user?.rol,
  });
}