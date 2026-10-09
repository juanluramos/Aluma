import { REFRESH_COOKIE } from '../../config/session.js';
import { endSession, refreshSession } from '../../services/auth/session.service.js';
import { AppError } from '../../errors/app-error.js';
export function readRefreshCookie(req) {
    return req.headers.cookie?.split(';').map(part => part.trim())
        .find(part => part.startsWith(`${REFRESH_COOKIE}=`))?.slice(REFRESH_COOKIE.length + 1);
}
function cookieOptions(req) {
    return { httpOnly: true, secure: req.secure || process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/auth' };
}
export function sendSession(req, res, session, extra = {}) {
    res.setHeader('Cache-Control', 'no-store');
    res.cookie(REFRESH_COOKIE, session.refreshToken, { ...cookieOptions(req), maxAge: Math.max(0, session.expiresAt.getTime() - Date.now()) });
    // Refresh credentials never appear in JSON or browser-readable storage.
    res.status(200).json({ ...extra, token: session.token });
}
export async function refreshController(req, res) {
    try {
        const result = await refreshSession(readRefreshCookie(req), req.get('X-Aluma-Activity') === '1', Number(req.get('X-Aluma-Activity-Age') ?? 0));
        sendSession(req, res, result);
    }
    catch (error) {
        if (error instanceof AppError && error.statusCode === 401)
            res.clearCookie(REFRESH_COOKIE, cookieOptions(req));
        throw error;
    }
}
export async function logoutController(req, res) {
    await endSession(readRefreshCookie(req));
    res.clearCookie(REFRESH_COOKIE, cookieOptions(req));
    res.setHeader('Cache-Control', 'no-store');
    res.sendStatus(204);
}
//# sourceMappingURL=session.controller.js.map