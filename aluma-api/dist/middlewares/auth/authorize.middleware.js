/**
 * Comprueba que el usuario autenticado tenga uno
 * de los roles permitidos para acceder a una ruta.
 */
export function authorize(...allowedRoles) {
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
//# sourceMappingURL=authorize.middleware.js.map