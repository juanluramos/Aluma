-- Inserta el estado de inscripción "En espera" si todavía no existe.
-- No modifica "Activa" ni "Cerrada" y no cambia la estructura de las tablas.
--
-- Ejecutar solo cuando se autorice escribir en MariaDB:
--   mysql -u USUARIO -p NOMBRE_BD < scripts/estado-inscripcion-en-espera.sql
--
-- Es idempotente: repetir el script no crea otro registro.

INSERT INTO `EstadoInscripcion` (`nombre`)
SELECT 'En espera'
WHERE NOT EXISTS (
  SELECT 1 FROM `EstadoInscripcion` WHERE `nombre` = 'En espera'
);
