-- CreateTable
CREATE TABLE `Actividad` (
    `id_actividad` INTEGER NOT NULL AUTO_INCREMENT,
    `titulo` VARCHAR(100) NOT NULL,
    `fecha` DATE NULL,
    `importeSocio` DECIMAL(10, 2) NULL,
    `importeNoSocio` DECIMAL(10, 2) NULL,
    `id_estado_actividad` INTEGER NOT NULL,
    `comentario` TEXT NULL,
    `createAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updateAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_actividad_estado`(`id_estado_actividad`),
    PRIMARY KEY (`id_actividad`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CuentaAutenticacion` (
    `id_cuenta` INTEGER NOT NULL AUTO_INCREMENT,
    `id_usuario` INTEGER NOT NULL,
    `proveedor` VARCHAR(20) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `password_hash` VARCHAR(255) NULL,
    `external_id` VARCHAR(255) NULL,
    `createAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updateAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_cuenta_usuario`(`id_usuario`),
    PRIMARY KEY (`id_cuenta`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EstadoActividad` (
    `id_estado_actividad` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre_estado` VARCHAR(15) NOT NULL,

    UNIQUE INDEX `nombre_estado`(`nombre_estado`),
    PRIMARY KEY (`id_estado_actividad`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EstadoPago` (
    `id_estado_pago` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre_estado` VARCHAR(30) NOT NULL,
    `requiereDatosPago` BOOLEAN NOT NULL DEFAULT false,
    `id_tipo_movimiento_generado` INTEGER NULL,

    UNIQUE INDEX `nombre_estado`(`nombre_estado`),
    INDEX `fk_estado_pago_tipo_movimiento`(`id_tipo_movimiento_generado`),
    PRIMARY KEY (`id_estado_pago`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EstadoUsuario` (
    `id_estado_usuario` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre_estado` VARCHAR(30) NOT NULL,
    `descripcion` VARCHAR(100) NULL,
    `permiteLogin` BOOLEAN NOT NULL,
    `permiteInscripcion` BOOLEAN NOT NULL,

    UNIQUE INDEX `nombre_estado`(`nombre_estado`),
    PRIMARY KEY (`id_estado_usuario`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InscripcionActividad` (
    `id_inscripcion` INTEGER NOT NULL AUTO_INCREMENT,
    `id_usuario` INTEGER NOT NULL,
    `id_actividad` INTEGER NOT NULL,
    `precioAplicado` DECIMAL(10, 2) NULL,
    `id_estado_pago` INTEGER NOT NULL,
    `id_estado_inscripcion` INTEGER NOT NULL,
    `id_metodo_pago` INTEGER NULL,
    `apuntadoFecha` DATE NOT NULL,
    `fechaPago` DATE NULL,
    `comentario` TEXT NULL,
    `createAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updateAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_inscripcion_actividad`(`id_actividad`),
    INDEX `fk_inscripcion_estado_pago`(`id_estado_pago`),
    INDEX `fk_inscripcion_metodo_pago`(`id_metodo_pago`),
    INDEX `fk_inscripcion_estado_inscripcion`(`id_estado_inscripcion`),
    INDEX `fk_inscripcion_usuario`(`id_usuario`),
    PRIMARY KEY (`id_inscripcion`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MetodoPago` (
    `id_metodo_pago` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(30) NOT NULL,

    UNIQUE INDEX `nombre_metodo`(`nombre`),
    PRIMARY KEY (`id_metodo_pago`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MovimientoContable` (
    `id_movimiento` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tipo_movimiento` INTEGER NOT NULL,
    `concepto` VARCHAR(25) NOT NULL,
    `importe` DECIMAL(10, 2) NOT NULL,
    `fecha` DATETIME(0) NOT NULL,
    `id_inscripcion` INTEGER NULL,
    `comentario` TEXT NULL,
    `createAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updateAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_movimiento_inscripcion`(`id_inscripcion`),
    INDEX `fk_movimiento_tipo`(`id_tipo_movimiento`),
    PRIMARY KEY (`id_movimiento`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RolUsuario` (
    `id_rol` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre_rol` VARCHAR(30) NOT NULL,

    UNIQUE INDEX `nombre_rol`(`nombre_rol`),
    PRIMARY KEY (`id_rol`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TipoDocumentoIdentificacion` (
    `id_tipo_documento` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(30) NOT NULL,

    UNIQUE INDEX `nombre`(`nombre`),
    PRIMARY KEY (`id_tipo_documento`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TipoMovimiento` (
    `id_tipo_movimiento` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(30) NOT NULL,
    `createAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updateAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `nombre`(`nombre`),
    PRIMARY KEY (`id_tipo_movimiento`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Usuario` (
    `id_usuario` INTEGER NOT NULL AUTO_INCREMENT,
    `codUsuario` VARCHAR(10) NULL,
    `id_tipo_documento` INTEGER NOT NULL,
    `numeroDocumento` VARCHAR(20) NOT NULL,
    `nombre` VARCHAR(50) NOT NULL,
    `apellido1` VARCHAR(50) NULL,
    `apellido2` VARCHAR(50) NULL,
    `email` VARCHAR(254) NOT NULL,
    `telefono` VARCHAR(15) NULL,
    `id_rol` INTEGER NOT NULL,
    `socio` BOOLEAN NOT NULL,
    `id_estado_usuario` INTEGER NOT NULL,
    `matriculaPagada` BOOLEAN NOT NULL,
    `comentario` TEXT NULL,
    `createAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updateAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `codUsuario`(`codUsuario`),
    UNIQUE INDEX `numeroDocumento`(`numeroDocumento`),
    UNIQUE INDEX `uq_usuario_email`(`email`),
    INDEX `fk_usuario_estado`(`id_estado_usuario`),
    INDEX `fk_usuario_rol`(`id_rol`),
    INDEX `fk_usuario_tipo_documento`(`id_tipo_documento`),
    PRIMARY KEY (`id_usuario`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EstadoInscripcion` (
    `id_estado_inscripcion` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(30) NOT NULL,
    `createAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updateAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `nombre`(`nombre`),
    PRIMARY KEY (`id_estado_inscripcion`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Auditoria` (
    `id_auditoria` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `fecha_evento` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `requestId` CHAR(36) NOT NULL,
    `id_usuario` INTEGER NULL,
    `rol_actor` VARCHAR(30) NULL,
    `accion` VARCHAR(64) NOT NULL,
    `recurso` VARCHAR(32) NOT NULL,
    `id_recurso` INTEGER NULL,
    `resultado` VARCHAR(16) NOT NULL,
    `codigo_error` VARCHAR(64) NULL,
    `detalles` JSON NULL,

    INDEX `idx_auditoria_fecha`(`fecha_evento`, `id_auditoria`),
    INDEX `idx_auditoria_usuario_fecha`(`id_usuario`, `fecha_evento`, `id_auditoria`),
    INDEX `idx_auditoria_recurso_fecha`(`recurso`, `id_recurso`, `fecha_evento`, `id_auditoria`),
    INDEX `idx_auditoria_accion_fecha`(`accion`, `fecha_evento`, `id_auditoria`),
    INDEX `idx_auditoria_request`(`requestId`, `id_auditoria`),
    PRIMARY KEY (`id_auditoria`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Actividad` ADD CONSTRAINT `fk_actividad_estado` FOREIGN KEY (`id_estado_actividad`) REFERENCES `EstadoActividad`(`id_estado_actividad`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `CuentaAutenticacion` ADD CONSTRAINT `fk_cuenta_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `Usuario`(`id_usuario`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `EstadoPago` ADD CONSTRAINT `fk_estado_pago_tipo_movimiento` FOREIGN KEY (`id_tipo_movimiento_generado`) REFERENCES `TipoMovimiento`(`id_tipo_movimiento`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `InscripcionActividad` ADD CONSTRAINT `fk_inscripcion_actividad` FOREIGN KEY (`id_actividad`) REFERENCES `Actividad`(`id_actividad`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `InscripcionActividad` ADD CONSTRAINT `fk_inscripcion_estado_inscripcion` FOREIGN KEY (`id_estado_inscripcion`) REFERENCES `EstadoInscripcion`(`id_estado_inscripcion`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `InscripcionActividad` ADD CONSTRAINT `fk_inscripcion_estado_pago` FOREIGN KEY (`id_estado_pago`) REFERENCES `EstadoPago`(`id_estado_pago`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `InscripcionActividad` ADD CONSTRAINT `fk_inscripcion_metodo_pago` FOREIGN KEY (`id_metodo_pago`) REFERENCES `MetodoPago`(`id_metodo_pago`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `InscripcionActividad` ADD CONSTRAINT `fk_inscripcion_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `Usuario`(`id_usuario`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `MovimientoContable` ADD CONSTRAINT `fk_movimiento_inscripcion` FOREIGN KEY (`id_inscripcion`) REFERENCES `InscripcionActividad`(`id_inscripcion`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `MovimientoContable` ADD CONSTRAINT `fk_movimiento_tipo` FOREIGN KEY (`id_tipo_movimiento`) REFERENCES `TipoMovimiento`(`id_tipo_movimiento`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Usuario` ADD CONSTRAINT `fk_usuario_estado` FOREIGN KEY (`id_estado_usuario`) REFERENCES `EstadoUsuario`(`id_estado_usuario`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Usuario` ADD CONSTRAINT `fk_usuario_rol` FOREIGN KEY (`id_rol`) REFERENCES `RolUsuario`(`id_rol`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Usuario` ADD CONSTRAINT `fk_usuario_tipo_documento` FOREIGN KEY (`id_tipo_documento`) REFERENCES `TipoDocumentoIdentificacion`(`id_tipo_documento`) ON DELETE RESTRICT ON UPDATE RESTRICT;
