
import { rateLimit } from "express-rate-limit";

/**
 * Limita las solicitudes de registro público
 * para reducir los registros automatizados.
 */
export const registroRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Demasiadas solicitudes de registro. Inténtalo más tarde.",
  },
});
