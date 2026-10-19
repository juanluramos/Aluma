import test from 'node:test';
import assert from 'node:assert/strict';
import { createCuotaSchema } from '../src/dtos/cuota/create-cuota.dto.js';
import { updateCuotaSchema } from '../src/dtos/cuota/update-cuota.dto.js';
import { efectosSocio } from '../src/services/cuota/service.js';
import { PAGO_ANIO_MAXIMO, PAGO_ANIO_MINIMO } from '../src/utils/validacionesCuota.js';

const alta = { id_usuario: 15, pagoAnio: 2026 };

test('el año de cuota admite histórico y próximo, y rechaza valores que no son enteros', () => {
  assert.equal(createCuotaSchema.safeParse({ ...alta, pagoAnio: PAGO_ANIO_MINIMO }).success, true);
  assert.equal(createCuotaSchema.safeParse({ ...alta, pagoAnio: PAGO_ANIO_MAXIMO }).success, true);
  for (const pagoAnio of [PAGO_ANIO_MINIMO - 1, PAGO_ANIO_MAXIMO + 1, 2026.5, Number.NaN, '2026', true, null]) {
    assert.equal(createCuotaSchema.safeParse({ ...alta, pagoAnio }).success, false, String(pagoAnio));
  }
  assert.equal(createCuotaSchema.safeParse({ id_usuario: 0, pagoAnio: 2026 }).success, false);
  assert.equal(createCuotaSchema.safeParse({ id_usuario: 1.5, pagoAnio: 2026 }).success, false);
});

test('fechaPago es un día YYYY-MM-DD y el comentario se normaliza sin tocar símbolos normales', () => {
  assert.equal(Object.hasOwn(createCuotaSchema.parse(alta), 'fechaPago'), false);
  assert.equal(Object.hasOwn(createCuotaSchema.parse({ ...alta, importePagado: 999 }), 'importePagado'), false);
  assert.equal(Object.hasOwn(updateCuotaSchema.parse({ comentario: 'Nota', importePagado: 1 }), 'importePagado'), false);
  assert.equal(createCuotaSchema.parse({ ...alta, fechaPago: '2024-02-29' }).fechaPago, '2024-02-29');
  for (const fechaPago of ['', '18/10/2026', '2026-02-31', '2025-02-29', '2026-10-18T00:00:00.000Z']) {
    assert.equal(createCuotaSchema.safeParse({ ...alta, fechaPago }).success, false, fechaPago);
    assert.equal(updateCuotaSchema.safeParse({ fechaPago }).success, false, fechaPago);
  }

  const simbolos = 'Pagó "transferencia" 50€ — ok\nsegunda línea';
  assert.equal(createCuotaSchema.parse({ ...alta, comentario: `  ${simbolos}  ` }).comentario, simbolos);
  assert.equal(createCuotaSchema.parse({ ...alta, comentario: '   ' }).comentario, null);
  assert.equal(createCuotaSchema.safeParse({ ...alta, comentario: 'a'.repeat(500) }).success, true);
  assert.equal(createCuotaSchema.safeParse({ ...alta, comentario: 'a'.repeat(501) }).success, false);
  for (const control of ['\u0000', '\u0008', '\u000B', '\u000C', '\u000E', '\u001F', '\u007F']) {
    assert.equal(createCuotaSchema.safeParse({ ...alta, comentario: `nota${control}` }).success, false, control.charCodeAt(0).toString(16));
  }
  assert.equal(createCuotaSchema.safeParse({ ...alta, comentario: 'línea\r\n\ttab' }).success, true);

  const parcial = updateCuotaSchema.parse({ comentario: 'Pago revisado' });
  assert.deepEqual(Object.keys(parcial), ['comentario']);
  assert.equal(updateCuotaSchema.safeParse({}).success, false);
});

test('solo el año actual cambia socio, y una lectura no forma parte de la regla', () => {
  const anio = 2031;
  const actual = { id_usuario: 10, pagoAnio: anio };
  const anterior = { id_usuario: 10, pagoAnio: anio - 1 };
  const otroActual = { id_usuario: 20, pagoAnio: anio };
  assert.deepEqual(efectosSocio(null, actual, anio), [{ id_usuario: 10, socio: true }]);
  assert.deepEqual(efectosSocio(null, anterior, anio), []);
  assert.deepEqual(efectosSocio(actual, null, anio), [{ id_usuario: 10, socio: false }]);
  assert.deepEqual(efectosSocio(anterior, null, anio), []);
  assert.deepEqual(efectosSocio(actual, anterior, anio), [{ id_usuario: 10, socio: false }]);
  assert.deepEqual(efectosSocio(anterior, actual, anio), [{ id_usuario: 10, socio: true }]);
  assert.deepEqual(efectosSocio(actual, otroActual, anio), [
    { id_usuario: 10, socio: false },
    { id_usuario: 20, socio: true },
  ]);
  assert.deepEqual(efectosSocio(anterior, { id_usuario: 20, pagoAnio: anio }, anio), [{ id_usuario: 20, socio: true }]);
  assert.deepEqual(efectosSocio(actual, { ...actual, pagoAnio: anio }, anio), []);
  assert.deepEqual(efectosSocio({ id_usuario: 10, pagoAnio: anio - 2 }, anterior, anio), []);
});
