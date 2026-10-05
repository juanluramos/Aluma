-- CreateTable
CREATE TABLE `EstadoSolicitud` (
    `id_estado_solicitud` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(20) NOT NULL,

    UNIQUE INDEX `EstadoSolicitud_nombre_key`(`nombre`),
    PRIMARY KEY (`id_estado_solicitud`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SolicitudAlta` (
    `id_solicitud` INTEGER NOT NULL AUTO_INCREMENT,
    `proveedor` VARCHAR(20) NOT NULL,
    `external_id` VARCHAR(255) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `id_tipo_documento` INTEGER NOT NULL,
    `numeroDocumento` VARCHAR(20) NOT NULL,
    `nombre` VARCHAR(50) NOT NULL,
    `apellido1` VARCHAR(50) NULL,
    `apellido2` VARCHAR(50) NULL,
    `telefono` VARCHAR(15) NULL,
    `socio` BOOLEAN NOT NULL,
    `id_estado_solicitud` INTEGER NOT NULL,
    `fechaSolicitud` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fechaResolucion` DATETIME(3) NULL,
    `id_administrador_resolucion` INTEGER NULL,
    `motivoRechazo` VARCHAR(500) NULL,
    `id_usuario_creado` INTEGER NULL,

    UNIQUE INDEX `SolicitudAlta_id_usuario_creado_key`(`id_usuario_creado`),
    INDEX `SolicitudAlta_id_estado_solicitud_fechaSolicitud_idx`(`id_estado_solicitud`, `fechaSolicitud`),
    UNIQUE INDEX `uq_solicitud_proveedor_external`(`proveedor`, `external_id`),
    PRIMARY KEY (`id_solicitud`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `uq_cuenta_proveedor_external` ON `CuentaAutenticacion`(`proveedor`, `external_id`);

-- AddForeignKey
ALTER TABLE `SolicitudAlta` ADD CONSTRAINT `SolicitudAlta_id_estado_solicitud_fkey` FOREIGN KEY (`id_estado_solicitud`) REFERENCES `EstadoSolicitud`(`id_estado_solicitud`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `SolicitudAlta` ADD CONSTRAINT `SolicitudAlta_id_tipo_documento_fkey` FOREIGN KEY (`id_tipo_documento`) REFERENCES `TipoDocumentoIdentificacion`(`id_tipo_documento`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `SolicitudAlta` ADD CONSTRAINT `SolicitudAlta_id_administrador_resolucion_fkey` FOREIGN KEY (`id_administrador_resolucion`) REFERENCES `Usuario`(`id_usuario`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `SolicitudAlta` ADD CONSTRAINT `SolicitudAlta_id_usuario_creado_fkey` FOREIGN KEY (`id_usuario_creado`) REFERENCES `Usuario`(`id_usuario`) ON DELETE RESTRICT ON UPDATE RESTRICT;

INSERT INTO EstadoSolicitud (id_estado_solicitud, nombre) VALUES (1, 'Pendiente'), (2, 'Aceptada'), (3, 'Rechazada');
