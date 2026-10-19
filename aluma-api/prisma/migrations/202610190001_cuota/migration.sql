-- Cuota anual de un usuario. Una sola fila por usuario y año.
-- fechaPago es un día de calendario; si no se indica, MariaDB usa la fecha actual.
CREATE TABLE `Cuota` (
    `id_cuota` INTEGER NOT NULL AUTO_INCREMENT,
    `id_usuario` INTEGER NOT NULL,
    `pagoAnio` INTEGER NOT NULL,
    `fechaPago` DATE NOT NULL DEFAULT (CURDATE()),
    `comentario` TEXT NULL,
    `createAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updateAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_cuota_usuario_anio`(`id_usuario`, `pagoAnio`),
    INDEX `fk_cuota_usuario`(`id_usuario`),
    PRIMARY KEY (`id_cuota`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Cuota` ADD CONSTRAINT `fk_cuota_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `Usuario`(`id_usuario`) ON DELETE RESTRICT ON UPDATE RESTRICT;
