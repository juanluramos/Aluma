import jwt from "jsonwebtoken";

import { JWT_SECRET } from "../config/jwt.js";
import { ACCESS_TOKEN_SECONDS } from "../config/session.js";

interface JwtPayload {
  id_usuario: number;
  rol: string;
  sid: string;
}

/**
 * Genera un JWT para un usuario autenticado.
 */
export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: ACCESS_TOKEN_SECONDS,
  });
}
