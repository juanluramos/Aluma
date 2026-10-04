import { OAuth2Client } from "google-auth-library";
import { authenticateWithOAuth } from "../../services/auth/oauth.service.js";
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_CALLBACK_URL);
/**
 * Inicia el proceso de autenticación con Google. Redirige al usuario a la página de inicio de sesión de Google.
 */
export function googleLoginController(req, res, next) {
    try {
        const authorizationUrl = googleClient.generateAuthUrl({
            access_type: 'offline',
            scope: ['profile', 'email', 'profile'],
            prompt: 'select_account',
        });
        res.redirect(authorizationUrl);
    }
    catch (error) {
        next(error);
    }
}
/**
 * Recibe el callback de Google.
 */
export async function googleCallbackController(req, res, next) {
    try {
        const code = req.query.code;
        if (typeof code !== "string") {
            res.status(400).json({
                message: "Código de autorización no válido",
                code: "INVALID_OAUTH_CODE",
            });
            return;
        }
        const { tokens } = await googleClient.getToken(code);
        const idToken = tokens.id_token;
        if (!idToken) {
            res.status(401).json({
                message: "Google no ha proporcionado un ID token",
                code: "GOOGLE_ID_TOKEN_MISSING",
            });
            return;
        }
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) {
            throw new Error("GOOGLE_CLIENT_ID no está configurado");
        }
        const ticket = await googleClient.verifyIdToken({
            idToken,
            audience: clientId,
        });
        const payload = ticket.getPayload();
        if (!payload) {
            res.status(401).json({
                message: "No se pudo obtener la identidad de Google",
                code: "GOOGLE_IDENTITY_NOT_FOUND",
            });
            return;
        }
        const result = await authenticateWithOAuth("Google", payload.sub, payload.email ?? "");
        res.status(200).json(result);
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=oauth.controller.js.map