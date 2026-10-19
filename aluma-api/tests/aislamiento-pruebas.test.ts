import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { Prisma } from '../src/generated/prisma/client.js';
import {
  AislamientoDePruebaRechazado,
  afirmarLecturaSql,
  decidirEscritura,
  registrarFila,
  reiniciarRegistroDePrueba,
} from '../src/config/aislamiento-pruebas.js';

test('las escrituras de prueba solo alcanzan registros propios', () => {
  reiniciarRegistroDePrueba();
  registrarFila('Usuario', { id_usuario: 7 });
  registrarFila('Actividad', { id_actividad: 4 });
  registrarFila('Auditoria', { id_auditoria: 9n, requestId: 'solicitud-propia' });
  registrarFila('SesionAutenticacion', { id: 'sesion-1', id_usuario: 7, refreshHash: 'hash-propio' });

  assert.equal(decidirEscritura('Usuario', 'deleteMany', { where: { id_usuario: { in: [7] } } }).omitir, false);
  assert.equal(decidirEscritura('Usuario', 'update', { where: { id_usuario: 7 } }).omitir, false);
  assert.equal(decidirEscritura('SesionAutenticacion', 'updateMany', { where: { refreshHash: 'hash-propio', revokedAt: null } }).omitir, false);
  assert.throws(() => decidirEscritura('Usuario', 'deleteMany', { where: { id_usuario: { in: [7, 8] } } }), AislamientoDePruebaRechazado);
  assert.throws(() => decidirEscritura('Usuario', 'deleteMany', { where: { email: { in: ['uno@aluma.test'] } } }), AislamientoDePruebaRechazado);
  assert.throws(() => decidirEscritura('Actividad', 'deleteMany', { where: { titulo: { in: ['Taller'] } } }), AislamientoDePruebaRechazado);
  assert.throws(() => decidirEscritura('MovimientoContable', 'deleteMany', { where: { concepto: { in: ['Cobro'] } } }), AislamientoDePruebaRechazado);
  assert.throws(() => decidirEscritura('EstadoInscripcion', 'create', { where: undefined }), AislamientoDePruebaRechazado);
  assert.throws(() => decidirEscritura('EstadoInscripcion', 'deleteMany', { where: { nombre: 'En espera' } }), AislamientoDePruebaRechazado);
  assert.throws(() => decidirEscritura('Usuario', 'createMany', { where: undefined }), AislamientoDePruebaRechazado);

  const auditoria = decidirEscritura('Auditoria', 'deleteMany', { where: { requestId: { in: ['solicitud-propia', 'ajena'] } } });
  assert.equal(auditoria.omitir, false);
  assert.deepEqual(auditoria.args?.where, { requestId: { in: ['solicitud-propia'] } });
  assert.equal(decidirEscritura('Auditoria', 'deleteMany', { where: { requestId: { in: ['ajena'] } } }).omitir, true);
  registrarFila('Cuota', { id_cuota: 8, id_usuario: 7 });
  registrarFila('ConfiguracionCuotaAnual', { id_configuracion: 6 });
  assert.equal(decidirEscritura('ConfiguracionCuotaAnual', 'delete', { where: { id_configuracion: 6 } }).omitir, false);
  assert.throws(() => decidirEscritura('ConfiguracionCuotaAnual', 'delete', { where: { id_configuracion: 1 } }), AislamientoDePruebaRechazado);
  assert.equal(decidirEscritura('Cuota', 'delete', { where: { id_cuota: 8 } }).omitir, false);
  assert.equal(decidirEscritura('Cuota', 'deleteMany', { where: { id_usuario: { in: [7] } } }).omitir, false);
  assert.throws(() => decidirEscritura('Cuota', 'delete', { where: { id_cuota: 1 } }), AislamientoDePruebaRechazado);
  registrarFila('InscripcionActividad', { id_inscripcion: 3, id_actividad: 99, id_usuario: 50 });
  assert.throws(() => decidirEscritura('Actividad', 'delete', { where: { id_actividad: 99 } }), AislamientoDePruebaRechazado);
  assert.throws(() => decidirEscritura('Usuario', 'delete', { where: { id_usuario: 50 } }), AislamientoDePruebaRechazado);
  assert.equal(decidirEscritura('InscripcionActividad', 'delete', { where: { id_inscripcion: 3 } }).omitir, false);
  reiniciarRegistroDePrueba();
});

test('el SQL de una prueba solo puede leer', () => {
  const lectura = Prisma.sql`SELECT id_inscripcion FROM InscripcionActividad WHERE id_inscripcion = ${1} FOR UPDATE`;
  assert.doesNotThrow(() => afirmarLecturaSql(lectura));
  assert.throws(() => afirmarLecturaSql(Prisma.sql`DELETE FROM Usuario WHERE id_usuario = ${1}`), AislamientoDePruebaRechazado);
  assert.throws(() => afirmarLecturaSql(Prisma.sql`TRUNCATE TABLE Actividad`), AislamientoDePruebaRechazado);
});

test('los tests de integración no borran catálogos ni identifican filas solo por nombre', () => {
  const archivos = readdirSync(new URL('.', import.meta.url)).filter((nombre) => nombre.endsWith('.test.ts'));
  for (const archivo of archivos) {
    if (archivo === 'aislamiento-pruebas.test.ts' || archivo === 'preparacion-aluma-test.test.ts') continue;
    const texto = readFileSync(new URL(archivo, import.meta.url), 'utf8');
    assert.doesNotMatch(texto, /estadoInscripcion\.create|estadoPago\.create|estadoUsuario\.create|rolUsuario\.create|tipoMovimiento\.create|metodoPago\.create/);
    assert.doesNotMatch(texto, /titulo:\s*\{\s*in|concepto:\s*\{\s*in|email:\s*\{\s*in/);
    assert.doesNotMatch(texto, /\bTRUNCATE\b|\bDROP\s+(TABLE|DATABASE)\b/);
  }
  const helper = readFileSync(new URL('estadoInscripcionPrueba.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(helper, /\.create\(|\.delete\(|\.deleteMany\(|\.update\(/);
});
