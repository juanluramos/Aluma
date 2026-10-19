-- Fecha de calendario. En una base nueva, las altas sin valor usan el día actual.
ALTER TABLE `Usuario` ADD COLUMN IF NOT EXISTS `fechaInscripcion` DATE NOT NULL DEFAULT (CURDATE());
