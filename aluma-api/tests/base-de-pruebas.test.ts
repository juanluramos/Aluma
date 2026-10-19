import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BASE_PRUEBAS,
  BaseDePruebasRechazada,
  esInvocacionDePrueba,
  exigirBaseDePruebas,
  exigirPruebasEnAluma,
} from '../src/config/base-de-pruebas.js';

const valida = {
  DATABASE_TEST_HOST: 'mariadb.pruebas.invalid',
  DATABASE_TEST_PORT: '3306',
  DATABASE_TEST_USER: 'aluma_test',
  DATABASE_TEST_PASSWORD: 'secreto-de-prueba',
  DATABASE_TEST_NAME: 'aluma_test',
  DATABASE_TEST_URL: 'mysql://aluma_test:secreto-de-prueba@mariadb.pruebas.invalid:3306/aluma_test',
};

function rechaza(env: NodeJS.ProcessEnv, fragmento: string) {
  assert.throws(() => exigirBaseDePruebas(env), (error: unknown) => {
    assert.ok(error instanceof BaseDePruebasRechazada);
    assert.match(error.message, new RegExp(fragmento));
    return true;
  });
}

test('NODE_ENV=test no convierte la aplicación en una prueba', () => {
  assert.equal(esInvocacionDePrueba(['node', 'src/app.ts'], { NODE_ENV: 'test' }), false);
  assert.equal(esInvocacionDePrueba(['node', '--test', 'tests/base-de-pruebas.test.ts'], {}), true);
  assert.equal(esInvocacionDePrueba(['node'], { ALUMA_PRUEBAS: '1' }), true);
});

test('sin base de pruebas o con la base real, la conexión se rechaza', () => {
  rechaza({ NODE_ENV: 'test', DATABASE_NAME: 'aluma', DATABASE_URL: 'mysql://aluma:clave@192.168.1.11:3306/aluma' }, 'No hay base de pruebas');
  rechaza({ ...valida, DATABASE_TEST_NAME: 'aluma' }, 'base real aluma');
  rechaza({ ...valida, DATABASE_TEST_NAME: ' aluma ', DATABASE_TEST_URL: '' }, 'base real aluma');
  rechaza({ ...valida, DATABASE_TEST_NAME: 'aluma_testing' }, 'exactamente aluma_test');
  rechaza({ ...valida, DATABASE_TEST_URL: 'mysql://aluma_test:secreto-de-prueba@mariadb.pruebas.invalid:3306/aluma' }, 'base real aluma');
  rechaza({ ...valida, DATABASE_TEST_URL: 'mysql://aluma_test:secreto-de-prueba@mariadb.pruebas.invalid:3306/aluma_test?database=aluma' }, 'única base');
  rechaza({ ...valida, DATABASE_TEST_URL: 'mysql://otro:secreto-de-prueba@mariadb.pruebas.invalid:3306/aluma_test' }, 'inequívocamente');
  rechaza({ ...valida, DATABASE_TEST_HOST: '' }, 'Faltan');
});

test('solo aluma_test, aunque la aplicación siga apuntando a aluma', () => {
  const conexion = exigirBaseDePruebas({
    ...valida,
    DATABASE_NAME: 'aluma',
    DATABASE_URL: 'mysql://aluma:clave-real@192.168.1.11:3306/aluma',
    NODE_ENV: 'test',
  });
  assert.equal(conexion.database, BASE_PRUEBAS);
  assert.equal(conexion.host, 'mariadb.pruebas.invalid');
  assert.equal(conexion.user, 'aluma_test');
  assert.equal(conexion.password, 'secreto-de-prueba');
  const conEspacios = exigirBaseDePruebas({ ...valida, DATABASE_TEST_NAME: ' aluma_test ', DATABASE_TEST_URL: '' });
  assert.equal(conEspacios.database, BASE_PRUEBAS);
});

test('la integración sobre aluma exige autorización y no acepta otra base', () => {
  const aluma = {
    ALUMA_AUTORIZAR_PRUEBAS_ALUMA: '1',
    DATABASE_HOST: 'mariadb.pruebas.invalid',
    DATABASE_PORT: '3306',
    DATABASE_USER: 'aluma',
    DATABASE_PASSWORD: 'no-se-usa',
    DATABASE_NAME: 'aluma',
    DATABASE_URL: 'mysql://aluma:no-se-usa@mariadb.pruebas.invalid:3306/aluma',
  };
  assert.throws(() => exigirPruebasEnAluma({ ...aluma, NODE_ENV: 'test', ALUMA_AUTORIZAR_PRUEBAS_ALUMA: undefined }), (error: unknown) => {
    assert.ok(error instanceof BaseDePruebasRechazada);
    assert.match(error.message, /ALUMA_AUTORIZAR_PRUEBAS_ALUMA/);
    return true;
  });
  assert.throws(() => exigirPruebasEnAluma({ ...aluma, DATABASE_NAME: 'aluma_test' }), /solo pueden usar la base aluma/);
  assert.throws(() => exigirPruebasEnAluma({
    ...aluma,
    DATABASE_URL: 'mysql://aluma:no-se-usa@mariadb.pruebas.invalid:3306/aluma_test',
  }), /no identifica inequívocamente/);
  assert.throws(() => exigirPruebasEnAluma({ ...aluma, DATABASE_TEST_NAME: 'aluma_test' }), /desviar/);
  assert.equal(exigirPruebasEnAluma(aluma).database, 'aluma');
});

test('npm test no lanza el conjunto de integración', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    scripts: { test: string; 'test:integracion': string };
  };
  assert.match(pkg.scripts.test, /ALUMA_PRUEBAS=1/);
  assert.match(pkg.scripts.test, /--test/);
  assert.doesNotMatch(pkg.scripts.test, /tests\/\*\.test\.ts/);
  assert.match(pkg.scripts['test:integracion'], /exigir-base-prueba\.ts/);
  assert.match(pkg.scripts['test:integracion'], /ALUMA_PRUEBAS=1/);
  assert.match(pkg.scripts['test:integracion'], /ALUMA_AUTORIZAR_PRUEBAS_ALUMA=1/);
  assert.doesNotMatch(pkg.scripts.test, /ALUMA_AUTORIZAR_PRUEBAS_ALUMA/);
  const archivos = [...pkg.scripts.test.matchAll(/tests\/[\w.-]+\.test\.ts/g)].map((coincidencia) => coincidencia[0]);
  for (const archivo of archivos) {
    if (archivo.endsWith('actividad-aforo-update.test.ts') || archivo.endsWith('prisma-guarda.test.ts')) continue;
    const texto = readFileSync(new URL(`../${archivo}`, import.meta.url), 'utf8');
    assert.doesNotMatch(texto, /config\/prisma/);
  }
});
