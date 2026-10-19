-- Propuesta de permisos. scripts/preparar-aluma-test.sh no ejecuta este archivo.
-- Ejecutar como administrador de MariaDB. La contraseña no se guarda en el repositorio.
-- Sustituye HOST por el origen desde el que se conecta la API, por ejemplo 192.168.1.%.
-- La cuenta queda limitada a aluma_test. Estas sentencias no conceden privilegios sobre ninguna otra base.

CREATE DATABASE IF NOT EXISTS `aluma_test`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'aluma_test'@'HOST' IDENTIFIED BY 'CLAVE';

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, ALTER, REFERENCES,
      CREATE TEMPORARY TABLES, LOCK TABLES
  ON `aluma_test`.*
  TO 'aluma_test'@'HOST';

FLUSH PRIVILEGES;

-- Comprobación esperada, también manual:
-- SHOW GRANTS FOR 'aluma_test'@'HOST';
-- El resultado solo debe citar aluma_test.
