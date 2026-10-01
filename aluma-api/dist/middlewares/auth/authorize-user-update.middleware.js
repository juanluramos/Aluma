/**
 * Comprueba qué campos puede modificar un usuario.
 *
 * Usuario:
 * - Solo puede modificar sus datos personales.
 *
 * Operador y Administrador:
 * - Pueden modificar todos los campos permitidos por el DTO.
 */
export function authorizeUserUpdate(req, res, next) {
    if (!req.user) {
        res.status(401).json({
            message: "Usuario no autenticado",
            code: "AUTHENTICATION_REQUIRED",
        });
        return;
    }
    if (req.user.rol === "Operador" ||
        req.user.rol === "Administrador") {
        next();
        return;
    }
    const allowedFields = [
        "codUsuario",
        "nombre",
        "apellido1",
        "apellido2",
        "email",
        "telefono",
    ];
    const requestedFields = Object.keys(req.body);
    const hasForbiddenField = requestedFields.some((field) => !allowedFields.includes(field));
    if (hasForbiddenField) {
        res.status(403).json({
            message: "No tienes permisos para modificar uno o más campos",
            code: "FORBIDDEN_FIELDS",
        });
        return;
    }
    next();
}
//# sourceMappingURL=authorize-user-update.middleware.js.map