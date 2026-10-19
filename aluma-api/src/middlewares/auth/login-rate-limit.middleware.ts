
import { rateLimit } from "express-rate-limit";

/**
 * Limita los intentos fallidos de inicio de sesión
 * por dirección IP.
 */
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Demasiados intentos. Inténtalo de nuevo en 15 minutos.",
  },
});
