-- Existing activities keep an unspecified capacity.
ALTER TABLE `Actividad` ADD COLUMN `aforo` INTEGER NULL;
