import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";
import { prisma } from "../../config/prisma.js";
import { findActiveSession } from "../../repositories/auth/session.repository.js";
/**
 * Comprueba que un valor sea un rol válido de ALUMA.
 */
function isValidRole(value) {
    return (value === "Usuario" ||
        value === "Operador" ||
        value === "Administrador");
}
/**
 * Comprueba que el payload del JWT tenga una estructura válida.
 */
function isValidAuthTokenPayload(payload) {
    if (typeof payload !== "object" ||
        payload === null) {
        return false;
    }
    const data = payload;
    return (typeof data.id_usuario === "number" &&
        Number.isSafeInteger(data.id_usuario) &&
        data.id_usuario > 0 &&
        isValidRole(data.rol) &&
        typeof data.sid === "string" && /^[a-f0-9-]{36}$/.test(data.sid) &&
        typeof data.iat === "number" && Number.isSafeInteger(data.iat) && data.iat >= 0 &&
        typeof data.exp === "number" && Number.isSafeInteger(data.exp) && data.exp > data.iat);
}
/**
 * Comprueba que la petición contiene un JWT válido.
 */
export async function requireAuth(req, res, next) {
    const authorization = req.headers.authorization;
    if (!authorization) {
        res.status(401).json({
            message: "Token de autenticación requerido",
            code: "AUTH_TOKEN_REQUIRED",
        });
        return;
    }
    const parts = authorization.split(" ");
    const [type, token] = parts;
    if (parts.length !== 2 || type !== "Bearer" || !token) {
        res.status(401).json({
            message: "Formato de token inválido",
            code: "INVALID_AUTH_TOKEN",
        });
        return;
    }
    try {
        const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
        if (!isValidAuthTokenPayload(payload)) {
            res.status(401).json({
                message: "Token inválido o expirado",
                code: "INVALID_AUTH_TOKEN",
            });
            return;
        }
        req.user = { id_usuario: payload.id_usuario, rol: payload.rol, iat: payload.iat, exp: payload.exp, sid: payload.sid };
    }
    catch {
        res.status(401).json({
            message: "Token inválido o expirado",
            code: "INVALID_AUTH_TOKEN",
        });
        return;
    }
    try {
        if (!await findActiveSession(req.user.sid, req.user.id_usuario)) {
            res.status(401).json({ message: "Sesión caducada o revocada", code: "SESSION_EXPIRED" });
            return;
        }
        const user = await prisma.usuario.findUnique({
            where: { id_usuario: req.user.id_usuario },
            select: { EstadoUsuario: { select: { permiteLogin: true } }, RolUsuario: { select: { nombre_rol: true } } },
        });
        if (!user) {
            res.status(401).json({ message: "Usuario no encontrado", code: "INVALID_AUTH_TOKEN" });
            return;
        }
        if (!user.EstadoUsuario.permiteLogin) {
            res.status(403).json({ message: "El usuario no tiene permitido iniciar sesión", code: "LOGIN_NOT_ALLOWED" });
            return;
        }
        if (!isValidRole(user.RolUsuario.nombre_rol)) {
            res.status(403).json({ message: "Rol de usuario no válido", code: "FORBIDDEN" });
            return;
        }
        req.user.rol = user.RolUsuario.nombre_rol;
        next();
    }
    catch (error) {
        next(error);
    }
}
/**
 * Alias compatible con el middleware anterior.
 *
 * Se mantiene para no romper las rutas existentes.
 */
export const authenticate = requireAuth;
//# sourceMappingURL=authenticate.middleware.js.map