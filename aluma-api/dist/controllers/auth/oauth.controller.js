import { OAuth2Client } from "google-auth-library";
import { authenticateWithOAuth } from "../../services/auth/oauth.service.js";
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../../config/jwt.js';
import { AppError } from '../../errors/app-error.js';
import { sendSession, readRefreshCookie } from "./session.controller.js";
import { endSession } from "../../services/auth/session.service.js";
const stateCookie = 'aluma_oauth_state';
const cookieOptions = { httpOnly: true, sameSite: 'lax', path: '/api/auth/google', maxAge: 600000 };
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_CALLBACK_URL);
/**
 * Inicia el proceso de autenticación con Google. Redirige al usuario a la página de inicio de sesión de Google.
 */
export function googleLoginController(req, res, next) {
    try {
        const state = jwt.sign({ nonce: randomUUID() }, JWT_SECRET, { algorithm: 'HS256', audience: 'oauth-state', expiresIn: '10m' });
        const authorizationUrl = googleClient.generateAuthUrl({
            state,
            access_type: 'offline',
            scope: ['profile', 'email', 'profile'],
            prompt: 'select_account',
        });
        res.cookie(stateCookie, state, { ...cookieOptions, secure: req.secure || process.env.NODE_ENV === 'production' });
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
        const state = req.query.state;
        const cookie = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${stateCookie}=`))?.slice(stateCookie.length + 1);
        res.clearCookie(stateCookie, { ...cookieOptions, secure: req.secure || process.env.NODE_ENV === 'production' });
        try {
            if (typeof state !== 'string' || !cookie || state !== cookie)
                throw new Error();
            jwt.verify(state, JWT_SECRET, { algorithms: ['HS256'], audience: 'oauth-state' });
        }
        catch {
            throw new AppError('Estado OAuth inválido o expirado', 400, 'INVALID_OAUTH_STATE');
        }
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
        if (!payload || !payload.sub || !payload.email || payload.email_verified !== true) {
            res.status(401).json({
                message: "No se pudo obtener la identidad de Google",
                code: "GOOGLE_IDENTITY_NOT_FOUND",
            });
            return;
        }
        const result = await authenticateWithOAuth("Google", payload.sub, payload.email);
        if (result.type === 'login') {
            await endSession(readRefreshCookie(req));
            sendSession(req, res, result, { type: result.type });
        }
        else {
            res.setHeader('Cache-Control', 'no-store');
            res.status(200).json(result);
        }
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=oauth.controller.js.map