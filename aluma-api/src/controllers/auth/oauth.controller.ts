import type { Request, Response, NextFunction } from "express";
import { OAuth2Client } from "google-auth-library";

const googleClient = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALLBACK_URL
);

/**
 * Inicia el proceso de autenticación con Google. Redirige al usuario a la página de inicio de sesión de Google.
 */

export function googleLoginController(
    req: Request, 
    res: Response, 
    next: NextFunction): void {
    try {
        const authorizationUrl = googleClient.generateAuthUrl({
            access_type: 'offline',
            scope: ['profile', 'email', 'profile'],
            prompt: 'select_account',
        });

        res.redirect(authorizationUrl);
    } catch (error) {
        next(error);
    }
}