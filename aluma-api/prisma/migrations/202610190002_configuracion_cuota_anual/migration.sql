-- Importe oficial de la cuota de cada año.
-- No se relaciona por clave ajena con Cuota: el importe aplicado se conserva en importePagado.
CREATE TABLE `ConfiguracionCuotaAnual` (
    `id_configuracion` INTEGER NOT NULL AUTO_INCREMENT,
    `anio` INTEGER NOT NULL,
    `importe` DECIMAL(10, 2) NOT NULL,
    `createAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updateAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_configuracion_cuota_anio`(`anio`),
    PRIMARY KEY (`id_configuracion`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Cuota no tenía filas al crear la columna, así que el histórico nace obligatorio.
ALTER TABLE `Cuota` ADD COLUMN `importePagado` DECIMAL(10, 2) NOT NULL;
