-- Ampliación necesaria para permisos de trabajo de hasta 30 caracteres.
-- Conserva la obligatoriedad, el índice UNIQUE y los datos existentes.
ALTER TABLE `Usuario` MODIFY `numeroDocumento` VARCHAR(30) NOT NULL;
