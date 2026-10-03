/**
 * Registra información básica de cada petición HTTP.
 *
 * No registra:
 * - Contraseñas
 * - JWT
 * - Cabeceras Authorization
 * - Cuerpos completos de las peticiones
 */
export function requestLogger(req, res, next) {
    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        const userId = req.user?.id_usuario ?? "anonymous";
        const role = req.user?.rol ?? "anonymous";
        console.log(`[HTTP] ${req.method} ${req.originalUrl} ` +
            `status=${res.statusCode} ` +
            `user=${userId} ` +
            `role=${role} ` +
            `duration=${duration}ms ` +
            `requestId=${req.requestId}`);
    });
    next();
}
//# sourceMappingURL=request-logger.middleware.js.map