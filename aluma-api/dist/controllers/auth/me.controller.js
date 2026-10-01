/**
 * Devuelve la información contenida en el JWT.
 */
export function getMeController(req, res) {
    res.status(200).json({
        id_usuario: req.user?.id_usuario,
        rol: req.user?.rol,
    });
}
//# sourceMappingURL=me.controller.js.map