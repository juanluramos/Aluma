-- Catálogos de referencia para aluma_test.
-- Solo inserta nombres que todavía no existen. No hace UPDATE, DELETE ni TRUNCATE.
-- No copia usuarios, cuentas, inscripciones, movimientos ni auditoría.
-- En una base vacía, los identificadores explícitos dejan:
--   EstadoInscripcion 1 Activa, 2 Cerrada, 3 En espera
--   EstadoActividad 1 Activo, 2 Inactivo, 3 Pendiente
--   EstadoUsuario 1 Activo, 2 Inactivo
--   TipoDocumentoIdentificacion 1 DNI, 2 NIE, 3 Pasaporte, 4 Permiso de trabajo
-- Ejecutar solo contra aluma_test, después de prisma/migrations.

INSERT INTO `TipoMovimiento` (`nombre`)
SELECT 'Cobro' WHERE NOT EXISTS (SELECT 1 FROM `TipoMovimiento` WHERE `nombre` = 'Cobro');
INSERT INTO `TipoMovimiento` (`nombre`)
SELECT 'Devolución' WHERE NOT EXISTS (SELECT 1 FROM `TipoMovimiento` WHERE `nombre` = 'Devolución');
INSERT INTO `TipoMovimiento` (`nombre`)
SELECT 'Ajuste' WHERE NOT EXISTS (SELECT 1 FROM `TipoMovimiento` WHERE `nombre` = 'Ajuste');

INSERT INTO `EstadoPago` (`nombre_estado`, `requiereDatosPago`, `id_tipo_movimiento_generado`)
SELECT 'Pendiente', 0, NULL
WHERE NOT EXISTS (SELECT 1 FROM `EstadoPago` WHERE `nombre_estado` = 'Pendiente');
INSERT INTO `EstadoPago` (`nombre_estado`, `requiereDatosPago`, `id_tipo_movimiento_generado`)
SELECT 'Cancelado', 0, NULL
WHERE NOT EXISTS (SELECT 1 FROM `EstadoPago` WHERE `nombre_estado` = 'Cancelado');
INSERT INTO `EstadoPago` (`nombre_estado`, `requiereDatosPago`, `id_tipo_movimiento_generado`)
SELECT 'Pagado', 1, (SELECT `id_tipo_movimiento` FROM `TipoMovimiento` WHERE `nombre` = 'Cobro')
WHERE NOT EXISTS (SELECT 1 FROM `EstadoPago` WHERE `nombre_estado` = 'Pagado');
INSERT INTO `EstadoPago` (`nombre_estado`, `requiereDatosPago`, `id_tipo_movimiento_generado`)
SELECT 'Devolución', 0, (SELECT `id_tipo_movimiento` FROM `TipoMovimiento` WHERE `nombre` = 'Devolución')
WHERE NOT EXISTS (SELECT 1 FROM `EstadoPago` WHERE `nombre_estado` = 'Devolución');

INSERT INTO `EstadoInscripcion` (`id_estado_inscripcion`, `nombre`)
SELECT 1, 'Activa'
WHERE NOT EXISTS (SELECT 1 FROM `EstadoInscripcion` WHERE `nombre` = 'Activa' OR `id_estado_inscripcion` = 1);
INSERT INTO `EstadoInscripcion` (`id_estado_inscripcion`, `nombre`)
SELECT 2, 'Cerrada'
WHERE NOT EXISTS (SELECT 1 FROM `EstadoInscripcion` WHERE `nombre` = 'Cerrada' OR `id_estado_inscripcion` = 2);
INSERT INTO `EstadoInscripcion` (`id_estado_inscripcion`, `nombre`)
SELECT 3, 'En espera'
WHERE NOT EXISTS (SELECT 1 FROM `EstadoInscripcion` WHERE `nombre` = 'En espera' OR `id_estado_inscripcion` = 3);

INSERT INTO `EstadoActividad` (`id_estado_actividad`, `nombre_estado`)
SELECT 1, 'Activo'
WHERE NOT EXISTS (SELECT 1 FROM `EstadoActividad` WHERE `nombre_estado` = 'Activo' OR `id_estado_actividad` = 1);
INSERT INTO `EstadoActividad` (`id_estado_actividad`, `nombre_estado`)
SELECT 2, 'Inactivo'
WHERE NOT EXISTS (SELECT 1 FROM `EstadoActividad` WHERE `nombre_estado` = 'Inactivo' OR `id_estado_actividad` = 2);
INSERT INTO `EstadoActividad` (`id_estado_actividad`, `nombre_estado`)
SELECT 3, 'Pendiente'
WHERE NOT EXISTS (SELECT 1 FROM `EstadoActividad` WHERE `nombre_estado` = 'Pendiente' OR `id_estado_actividad` = 3);

INSERT INTO `RolUsuario` (`nombre_rol`)
SELECT 'Administrador' WHERE NOT EXISTS (SELECT 1 FROM `RolUsuario` WHERE `nombre_rol` = 'Administrador');
INSERT INTO `RolUsuario` (`nombre_rol`)
SELECT 'Operador' WHERE NOT EXISTS (SELECT 1 FROM `RolUsuario` WHERE `nombre_rol` = 'Operador');
INSERT INTO `RolUsuario` (`nombre_rol`)
SELECT 'Usuario' WHERE NOT EXISTS (SELECT 1 FROM `RolUsuario` WHERE `nombre_rol` = 'Usuario');

INSERT INTO `EstadoUsuario` (`id_estado_usuario`, `nombre_estado`, `permiteLogin`, `permiteInscripcion`)
SELECT 1, 'Activo', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM `EstadoUsuario` WHERE `nombre_estado` = 'Activo' OR `id_estado_usuario` = 1);
INSERT INTO `EstadoUsuario` (`id_estado_usuario`, `nombre_estado`, `permiteLogin`, `permiteInscripcion`)
SELECT 2, 'Inactivo', 0, 0
WHERE NOT EXISTS (SELECT 1 FROM `EstadoUsuario` WHERE `nombre_estado` = 'Inactivo' OR `id_estado_usuario` = 2);
INSERT INTO `EstadoUsuario` (`id_estado_usuario`, `nombre_estado`, `descripcion`, `permiteLogin`, `permiteInscripcion`)
SELECT 3, 'Pendiente', 'Alta solicitada desde el login, pendiente de revisión.', 0, 0
WHERE NOT EXISTS (SELECT 1 FROM `EstadoUsuario` WHERE `nombre_estado` = 'Pendiente' OR `id_estado_usuario` = 3);

INSERT INTO `TipoDocumentoIdentificacion` (`id_tipo_documento`, `nombre`)
SELECT 1, 'DNI'
WHERE NOT EXISTS (SELECT 1 FROM `TipoDocumentoIdentificacion` WHERE `nombre` = 'DNI' OR `id_tipo_documento` = 1);
INSERT INTO `TipoDocumentoIdentificacion` (`id_tipo_documento`, `nombre`)
SELECT 2, 'NIE'
WHERE NOT EXISTS (SELECT 1 FROM `TipoDocumentoIdentificacion` WHERE `nombre` = 'NIE' OR `id_tipo_documento` = 2);
INSERT INTO `TipoDocumentoIdentificacion` (`id_tipo_documento`, `nombre`)
SELECT 3, 'Pasaporte'
WHERE NOT EXISTS (SELECT 1 FROM `TipoDocumentoIdentificacion` WHERE `nombre` = 'Pasaporte' OR `id_tipo_documento` = 3);
INSERT INTO `TipoDocumentoIdentificacion` (`id_tipo_documento`, `nombre`)
SELECT 4, 'Permiso de trabajo'
WHERE NOT EXISTS (SELECT 1 FROM `TipoDocumentoIdentificacion` WHERE `nombre` = 'Permiso de trabajo' OR `id_tipo_documento` = 4);

INSERT INTO `EstadoSolicitud` (`nombre`)
SELECT 'Pendiente' WHERE NOT EXISTS (SELECT 1 FROM `EstadoSolicitud` WHERE `nombre` = 'Pendiente');
INSERT INTO `EstadoSolicitud` (`nombre`)
SELECT 'Aceptada' WHERE NOT EXISTS (SELECT 1 FROM `EstadoSolicitud` WHERE `nombre` = 'Aceptada');
INSERT INTO `EstadoSolicitud` (`nombre`)
SELECT 'Rechazada' WHERE NOT EXISTS (SELECT 1 FROM `EstadoSolicitud` WHERE `nombre` = 'Rechazada');

INSERT INTO `MetodoPago` (`nombre`)
SELECT 'Efectivo' WHERE NOT EXISTS (SELECT 1 FROM `MetodoPago` WHERE `nombre` = 'Efectivo');
INSERT INTO `MetodoPago` (`nombre`)
SELECT 'Transferencia' WHERE NOT EXISTS (SELECT 1 FROM `MetodoPago` WHERE `nombre` = 'Transferencia');
INSERT INTO `MetodoPago` (`nombre`)
SELECT 'Tarjeta' WHERE NOT EXISTS (SELECT 1 FROM `MetodoPago` WHERE `nombre` = 'Tarjeta');
INSERT INTO `MetodoPago` (`nombre`)
SELECT 'Bizum' WHERE NOT EXISTS (SELECT 1 FROM `MetodoPago` WHERE `nombre` = 'Bizum');
