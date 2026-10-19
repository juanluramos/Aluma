import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  afirmarSqlDePreparacion,
  afirmarUrlDeMigracion,
  pasosPreparacion,
  preparacionAutorizada,
  reinicioSolicitado,
  riesgoSql,
} from '../src/config/preparacion-aluma-test.js';

function leer(ruta: string): string {
  return readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8');
}

const catalogo = leer('scripts/aluma-test-catalogos.sql');
const permisos = leer('scripts/aluma-test-permisos.sql');
const preparacion = leer('scripts/preparar-aluma-test.sh');
const comprobacion = leer('scripts/comprobar-preparacion-aluma-test.ts');
const migraciones = readdirSync(new URL('../prisma/migrations', import.meta.url))
  .filter((nombre) => nombre !== 'migration_lock.toml')
  .sort()
  .map((nombre) => ({
    ruta: join('prisma/migrations', nombre, 'migration.sql'),
    sql: leer(join('prisma/migrations', nombre, 'migration.sql')),
  }));

const nombres = {
  EstadoInscripcion: ['Activa', 'Cerrada', 'En espera'],
  EstadoPago: ['Pendiente', 'Pagado', 'Devolución', 'Cancelado'],
  TipoMovimiento: ['Cobro', 'Devolución', 'Ajuste'],
  EstadoActividad: ['Activo', 'Inactivo', 'Pendiente'],
  RolUsuario: ['Administrador', 'Operador', 'Usuario'],
  EstadoUsuario: ['Activo', 'Inactivo'],
  TipoDocumentoIdentificacion: ['DNI', 'NIE', 'Pasaporte', 'Permiso de trabajo'],
  EstadoSolicitud: ['Pendiente', 'Aceptada', 'Rechazada'],
  MetodoPago: ['Efectivo', 'Transferencia', 'Tarjeta', 'Bizum'],
};

test('la autorización correcta convive con el nombre anterior', () => {
  assert.equal(preparacionAutorizada({ ALUMA_AUTORIZAR_ALUMA_TEST: '1' }), true);
  assert.equal(preparacionAutorizada({ ALUMA_AUTORIZAR_ALUMAT_TEST: '1' }), true);
  assert.equal(preparacionAutorizada({ ALUMA_AUTORIZAR_ALUMA_TEST: 'true' }), false);
  assert.equal(preparacionAutorizada({}), false);
  assert.equal(reinicioSolicitado({ ALUMA_AUTORIZAR_REINICIO_ALUMA_TEST: '1' }), true);
  assert.equal(reinicioSolicitado({ ALUMA_AUTORIZAR_REINICIO_ALUMAT_TEST: '1' }), true);
  assert.equal(reinicioSolicitado({ ALUMA_AUTORIZAR_ALUMA_TEST: '1' }), false);
  assert.match(preparacion, /ALUMA_AUTORIZAR_ALUMA_TEST/);
  assert.match(preparacion, /ALUMA_AUTORIZAR_ALUMAT_TEST/);
  assert.match(leer('.env.example'), /ALUMA_AUTORIZAR_ALUMA_TEST=1 sh scripts\/preparar-aluma-test\.sh/);
});

test('una segunda ejecución no tiene un paso de borrado', () => {
  assert.deepEqual(pasosPreparacion(false), ['crear', 'migrar', 'catalogos']);
  assert.deepEqual(pasosPreparacion(true), ['migrar', 'catalogos']);
  assert.doesNotMatch(preparacion, /\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|migrate reset|migrate dev/i);
  assert.match(preparacion, /SCHEMA_NAME = 'aluma_test'/);
  assert.match(preparacion, /ya existe/);
  assert.doesNotMatch(preparacion, /aluma-test-permisos\.sql/);
  assert.match(comprobacion, /reinicioSolicitado/);
});

test('el SQL de preparación no puede nombrar la base aluma', () => {
  afirmarSqlDePreparacion([
    ...migraciones,
    { ruta: 'scripts/aluma-test-catalogos.sql', sql: catalogo },
    { ruta: 'scripts/aluma-test-permisos.sql', sql: permisos },
    { ruta: 'create', sql: "CREATE DATABASE IF NOT EXISTS `aluma_test` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" },
  ]);
  assert.equal(riesgoSql('GRANT ALL ON *.* TO \'aluma_test\'@\'%\';'), 'concede privilegios globales');
  assert.equal(riesgoSql("CREATE DATABASE `aluma`;"), 'menciona la base aluma');
  assert.equal(riesgoSql('DROP DATABASE `aluma_test`;'), 'contiene DROP');
  assert.equal(riesgoSql('DELETE FROM `Usuario`;'), 'contiene DELETE');
  assert.equal(riesgoSql('UPDATE `Usuario` SET `socio` = 1;'), 'contiene UPDATE');
  assert.equal(riesgoSql('`updateAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0)'), null);
  assert.equal(riesgoSql('GRANT ALL ON `aluma`.* TO \'aluma_test\'@\'%\';'), 'menciona la base aluma');
  assert.equal(riesgoSql("CREATE DATABASE `otra`;"), 'CREATE DATABASE no nombra aluma_test');
  assert.throws(() => afirmarUrlDeMigracion('mysql://u:p@h:3306/aluma'), /no identifica aluma_test/);
  assert.throws(() => afirmarUrlDeMigracion('mysql://u:p@h:3306/notaluma_test'), /no identifica aluma_test/);
  assert.throws(() => afirmarUrlDeMigracion('mysql://u:p@h:3306/aluma_test?database=aluma'), /no identifica aluma_test/);
  afirmarUrlDeMigracion('mysql://u:p@h:3306/aluma_test');
});

test('los catálogos cubren los nombres que usan las pruebas', () => {
  for (const lista of Object.values(nombres)) {
    for (const nombre of lista) assert.ok(catalogo.includes(`'${nombre}'`), nombre);
  }
  assert.match(catalogo, /SELECT 1, 'Activo', 1, 1/);
  assert.match(catalogo, /SELECT 2, 'Inactivo', 0, 0/);
  assert.match(catalogo, /SELECT 3, 'En espera'/);
  const inserciones = catalogo.split(';').map((parte) => parte.trim()).filter((parte) => /^INSERT\b/i.test(parte));
  assert.ok(inserciones.length > 0);
  for (const insercion of inserciones) assert.match(insercion, /WHERE NOT EXISTS/i);
  assert.equal(riesgoSql(catalogo), null);
});

test('las migraciones crean el esquema completo sin datos personales', () => {
  const esquema = leer('prisma/schema.prisma');
  const tablas = [...esquema.matchAll(/^model (\w+)/gm)].map((coincidencia) => coincidencia[1]);
  const sql = migraciones.map((migracion) => migracion.sql).join('\n');
  for (const tabla of tablas) assert.match(sql, new RegExp(`CREATE TABLE \`${tabla}\``));
  assert.match(sql, /ADD COLUMN `aforo` INTEGER NULL/);
  assert.match(sql, /MODIFY `numeroDocumento` VARCHAR\(30\) NOT NULL/);
  assert.match(sql, /INSERT INTO EstadoSolicitud \(id_estado_solicitud, nombre\) VALUES \(1, 'Pendiente'\), \(2, 'Aceptada'\), \(3, 'Rechazada'\)/);
  assert.deepEqual(migraciones.map((migracion) => migracion.ruta), [
    'prisma/migrations/202610050001_baseline/migration.sql',
    'prisma/migrations/202610050002_solicitud_alta/migration.sql',
    'prisma/migrations/202610080001_actividad_aforo/migration.sql',
    'prisma/migrations/202610090001_auth_sessions/migration.sql',
    'prisma/migrations/202610100001_usuario_documento_30/migration.sql',
    'prisma/migrations/202610180001_usuario_documento_opcional/migration.sql',
    'prisma/migrations/202610180002_usuario_fecha_inscripcion/migration.sql',
    'prisma/migrations/202610180003_usuario_email_opcional/migration.sql',
    'prisma/migrations/202610190001_cuota/migration.sql',
    'prisma/migrations/202610190002_configuracion_cuota_anual/migration.sql',
  ]);
  assert.doesNotMatch(sql, /INSERT INTO `(Usuario|CuentaAutenticacion|InscripcionActividad|MovimientoContable|Auditoria|SolicitudAlta)`/);
});
