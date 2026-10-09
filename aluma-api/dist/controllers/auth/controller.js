import { sendSession, readRefreshCookie } from "./session.controller.js";
import { endSession } from "../../services/auth/session.service.js";
import { loginSchema } from "../../dtos/auth/login.dto.js";
import { loginUser } from "../../services/auth/service.js";
/**
 * Controlador para iniciar sesión.
 */
export async function loginController(req, res) {
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
    const resultLogin = await loginUser(email, password, req.requestId);
    await endSession(readRefreshCookie(req));
    sendSession(req, res, resultLogin);
}
//# sourceMappingURL=controller.js.map