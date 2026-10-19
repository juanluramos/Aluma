import test from 'node:test';
import assert from 'node:assert/strict';
import { createUserSchema } from '../src/dtos/usuario/create-user.dto.js';
import { updateUserSchema } from '../src/dtos/usuario/update-user.dto.js';
import {
  fechaHoyCalendario,
  fechaInscripcionAlActualizar,
  fechaInscripcionAlCrear,
  textoFechaCalendario,
} from '../src/utils/fechaCalendario.js';

const alta = {
  nombre: 'Ana',
  email: 'ana@example.test',
  id_rol: 1,
  socio: false,
  id_estado_usuario: 1,
  matriculaPagada: false,
  password: 'Clave123',
};

test('crear sin fecha usa el día actual y una fecha válida se conserva', () => {
  const sinFecha = createUserSchema.parse(alta);
  assert.equal(Object.hasOwn(sinFecha, 'fechaInscripcion'), false);
  const hoy = fechaHoyCalendario();
  assert.equal(textoFechaCalendario(fechaInscripcionAlCrear(sinFecha.fechaInscripcion, hoy)), hoy);

  const conFecha = createUserSchema.parse({ ...alta, fechaInscripcion: ' 2024-02-29 ' });
  assert.equal(conFecha.fechaInscripcion, '2024-02-29');
  assert.equal(textoFechaCalendario(fechaInscripcionAlCrear(conFecha.fechaInscripcion, '2026-01-01')), '2024-02-29');
});

test('rechaza una fecha de inscripción inválida', () => {
  for (const fechaInscripcion of ['', '18/10/2026', '2026-02-31', '2026-13-01', '2025-02-29', '2026-10-18T00:00:00.000Z']) {
    assert.equal(createUserSchema.safeParse({ ...alta, fechaInscripcion }).success, false, fechaInscripcion);
    assert.equal(updateUserSchema.safeParse({ fechaInscripcion }).success, false, fechaInscripcion);
  }
});

test('editar la fecha y una actualización parcial que no la envía', () => {
  assert.deepEqual(updateUserSchema.parse({ fechaInscripcion: '2026-03-04' }), { fechaInscripcion: '2026-03-04' });
  assert.equal(textoFechaCalendario(fechaInscripcionAlActualizar('2026-03-04')!), '2026-03-04');

  const parcial = updateUserSchema.parse({ nombre: 'Ana' });
  assert.equal(Object.hasOwn(parcial, 'fechaInscripcion'), false);
  assert.equal(fechaInscripcionAlActualizar(parcial.fechaInscripcion), undefined);
});
