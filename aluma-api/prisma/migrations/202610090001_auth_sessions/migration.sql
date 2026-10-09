CREATE TABLE `SesionAutenticacion` (
    `id` CHAR(36) NOT NULL,
    `id_usuario` INTEGER NOT NULL,
    `refreshHash` CHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastActivityAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    UNIQUE INDEX `SesionAutenticacion_refreshHash_key`(`refreshHash`),
    INDEX `SesionAutenticacion_id_usuario_idx`(`id_usuario`),
    INDEX `SesionAutenticacion_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SesionAutenticacion` ADD CONSTRAINT `SesionAutenticacion_id_usuario_fkey`
FOREIGN KEY (`id_usuario`) REFERENCES `Usuario`(`id_usuario`) ON DELETE CASCADE ON UPDATE RESTRICT;
