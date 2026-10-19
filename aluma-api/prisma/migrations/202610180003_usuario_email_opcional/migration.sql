-- Un usuario puede darse de alta sin email. Operador y Administrador lo siguen necesitando.
-- MariaDB admite varios NULL en la clave UNIQUE.
ALTER TABLE `Usuario` MODIFY `email` VARCHAR(254) NULL;
