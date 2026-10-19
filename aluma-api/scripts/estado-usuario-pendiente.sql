INSERT INTO `EstadoUsuario` (`id_estado_usuario`, `nombre_estado`, `descripcion`, `permiteLogin`, `permiteInscripcion`)
SELECT 3, 'Pendiente', 'Alta solicitada desde el login, pendiente de revisión.', 0, 0
WHERE NOT EXISTS (SELECT 1 FROM `EstadoUsuario` WHERE `nombre_estado` = 'Pendiente' OR `id_estado_usuario` = 3);
