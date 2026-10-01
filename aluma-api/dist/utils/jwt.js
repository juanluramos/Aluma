import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/jwt.js";
/**
 * Genera un JWT para un usuario autenticado.
 */
export function generateToken(payload) {
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: "1h",
    });
}
//# sourceMappingURL=jwt.js.map