-- El alta de un usuario puede guardarse sin documento de identidad.
-- MariaDB admite varios NULL en la clave UNIQUE.
ALTER TABLE `Usuario` MODIFY `id_tipo_documento` INT NULL;
ALTER TABLE `Usuario` MODIFY `numeroDocumento` VARCHAR(30) NULL;
