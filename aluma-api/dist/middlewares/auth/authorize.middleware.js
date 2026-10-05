/**
 * Comprueba que el usuario autenticado tenga
 * uno de los roles permitidos.
 */
export function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({
                message: "Usuario no autenticado",
                code: "AUTHENTICATION_REQUIRED",
            });
            return;
        }
        if (!allowedRoles.includes(req.user.rol)) {
            res.status(403).json({
                message: "No tienes permisos para realizar esta operación",
                code: "FORBIDDEN",
            });
            return;
        }
        next();
    };
}
/**
 * Alias compatible con el middleware anterior.
 *
 * Se mantiene para no romper las rutas existentes.
 */
export const authorize = requireRole;
//# sourceMappingURL=authorize.middleware.js.map