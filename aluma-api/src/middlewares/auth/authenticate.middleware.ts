import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { JWT_SECRET } from "../../config/jwt.js";

export interface AuthTokenPayload {
  id_usuario: number;
  rol: string;
  iat: number;
  exp: number;
}

/**
 * Comprueba que la petición contiene un JWT válido.
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authorization = req.headers.authorization;

  if (!authorization) {
    res.status(401).json({
      message: "Token de autenticación requerido",
      code: "AUTH_TOKEN_REQUIRED",
    });

    return;
  }

  const [type, token] = authorization.split(" ");

  if (type !== "Bearer" || !token) {
    res.status(401).json({
      message: "Formato de token inválido",
      code: "INVALID_AUTH_TOKEN",
    });

    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;

    req.user = payload;

    next();
  } catch {
    res.status(401).json({
      message: "Token inválido o expirado",
      code: "INVALID_AUTH_TOKEN",
    });
  }
}