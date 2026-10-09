import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivitySchema } from '../src/dtos/actividad/create-activity.dto.js';
import { updateActivitySchema } from '../src/dtos/actividad/update-activity.dto.js';

for (const [name, schema] of [['create', createActivitySchema], ['update', updateActivitySchema]] as const) {
  const base = { titulo: 'Actividad de prueba', id_estado_actividad: 1 };
  test(`${name}: aforo opcional y entero positivo compatible con INT`, () => {
    assert.equal(schema.safeParse(base).success, true);
    for (const aforo of [1, 30, 2147483647]) {
      assert.equal(schema.parse({ ...base, aforo }).aforo, aforo);
    }
    for (const aforo of [0, -1, 1.5, '30', 'texto', null, true, NaN, Infinity, 2147483648]) {
      assert.equal(schema.safeParse({ ...base, aforo }).success, false, `Aceptado: ${aforo}`);
    }
  });
}
test('actualizar únicamente aforo es válido', () => {
  assert.deepEqual(updateActivitySchema.parse({ aforo: 25 }), { aforo: 25 });
});
