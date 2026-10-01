import jwt from "jsonwebtoken";

import { JWT_SECRET } from "../config/jwt.js";

interface JwtPayload {
  id_usuario: number;
  rol: string;
}

/**
 * Genera un JWT para un usuario autenticado.
 */
export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: "1h",
  });
}