import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfiguracionCuotaSchema } from '../src/dtos/configuracion-cuota/create-configuracion-cuota.dto.js';
import { updateConfiguracionCuotaSchema } from '../src/dtos/configuracion-cuota/update-configuracion-cuota.dto.js';
import { PAGO_ANIO_MAXIMO, PAGO_ANIO_MINIMO } from '../src/utils/validacionesCuota.js';

test('el año y el importe de la configuración se normalizan a dos decimales', () => {
  assert.deepEqual(createConfiguracionCuotaSchema.parse({ anio: 2026, importe: 30 }), { anio: 2026, importe: '30.00' });
  assert.equal(createConfiguracionCuotaSchema.parse({ anio: 2026, importe: 30.1 }).importe, '30.10');
  assert.equal(createConfiguracionCuotaSchema.parse({ anio: 2026, importe: 30.12 }).importe, '30.12');
  assert.equal(createConfiguracionCuotaSchema.parse({ anio: PAGO_ANIO_MINIMO, importe: 0.01 }).anio, PAGO_ANIO_MINIMO);
  assert.equal(createConfiguracionCuotaSchema.parse({ anio: PAGO_ANIO_MAXIMO, importe: 99999999.99 }).importe, '99999999.99');
});

test('rechaza año, cero, negativo, decimales de más y valores que no son un importe', () => {
  for (const anio of [PAGO_ANIO_MINIMO - 1, PAGO_ANIO_MAXIMO + 1, 2026.5, Number.NaN, '2026', true, null]) {
    assert.equal(createConfiguracionCuotaSchema.safeParse({ anio, importe: 30 }).success, false, String(anio));
  }
  for (const importe of [0, -1, -0.01, 1.234, 10.555, 100000000, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, true, '30', '30.00', null]) {
    assert.equal(createConfiguracionCuotaSchema.safeParse({ anio: 2026, importe }).success, false, String(importe));
  }
  assert.equal(createConfiguracionCuotaSchema.safeParse({ importe: 30 }).success, false);
  assert.equal(createConfiguracionCuotaSchema.safeParse({ anio: 2026 }).success, false);
});

test('la edición es parcial y aplica las mismas reglas', () => {
  assert.deepEqual(updateConfiguracionCuotaSchema.parse({ importe: 35 }), { importe: '35.00' });
  assert.deepEqual(Object.keys(updateConfiguracionCuotaSchema.parse({ anio: 2027 })), ['anio']);
  assert.equal(updateConfiguracionCuotaSchema.safeParse({}).success, false);
  assert.equal(updateConfiguracionCuotaSchema.safeParse({ importe: 0 }).success, false);
  assert.equal(updateConfiguracionCuotaSchema.safeParse({ importe: -5 }).success, false);
  assert.equal(updateConfiguracionCuotaSchema.safeParse({ importe: 1.234 }).success, false);
  assert.equal(updateConfiguracionCuotaSchema.safeParse({ anio: 1969 }).success, false);
});
