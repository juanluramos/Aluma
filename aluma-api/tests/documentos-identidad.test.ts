import test from 'node:test';
import assert from 'node:assert/strict';
import { documentoUsuarioSchema } from '../src/utils/validacionesUsuario.js';
import { oauthRegisterSchema } from '../src/dtos/auth/oauth-register.dto.js';
import { registroSchema } from '../src/dtos/auth/registro.dto.js';
import { createUserSchema } from '../src/dtos/usuario/create-user.dto.js';
import { updateUserSchema } from '../src/dtos/usuario/update-user.dto.js';

const casos: readonly [number, readonly string[], readonly string[]][] = [
  [1, ['12345678Z', ' 12345678z ', '00000000T'], ['12345678A', '1234567Z', '123456789Z', '']],
  [2, ['x1234567l', 'Y1234567X', 'Z1234567R'], ['X1234567A', 'A1234567L', 'X12345!7L', '']],
  [3, ['ab12345', '123456789', 'ABC123456', 'A'.repeat(20)], ['', ' ', 'AB12', 'AB<123', 'AB-123', 'A'.repeat(21)]],
  [4, ['pt-12345', 'A'.repeat(30), 'x1234567l', 'Y1234567X', 'Z1234567R'], ['', 'AB12', '-----', 'AB_123', 'A'.repeat(31), 'X1234567A', 'Y1234567A', 'Z1234567A']],
];

for (const [id_tipo_documento, validos, invalidos] of casos) {
  test(`Documento ${id_tipo_documento}: formato y normalización en el servidor`, () => {
    for (const numeroDocumento of validos) {
      const resultado = documentoUsuarioSchema.parse({ id_tipo_documento, numeroDocumento });
      assert.equal(resultado.numeroDocumento, numeroDocumento.trim().toUpperCase());
    }
    for (const numeroDocumento of invalidos) {
      assert.equal(documentoUsuarioSchema.safeParse({ id_tipo_documento, numeroDocumento }).success, false, numeroDocumento);
    }
  });
  test(`Solicitud de alta ${id_tipo_documento}: reutiliza las reglas documentales`, () => {
    for (const numeroDocumento of validos.filter(numero => numero.trim().length <= 20)) {
      assert.equal(oauthRegisterSchema.parse({ id_tipo_documento, numeroDocumento, nombre: 'Ana', socio: false }).numeroDocumento, numeroDocumento.trim().toUpperCase());
    }
    for (const numeroDocumento of invalidos) {
      assert.equal(oauthRegisterSchema.safeParse({ id_tipo_documento, numeroDocumento, nombre: 'Ana', socio: false }).success, false);
    }
  });
}

const alta = {
  nombre: 'Ana',
  email: 'ana@example.test',
  id_rol: 1,
  socio: false,
  id_estado_usuario: 1,
  matriculaPagada: false,
  password: 'Clave123',
};

test('El alta de personal admite un usuario sin documento', () => {
  assert.equal(createUserSchema.safeParse(alta).success, true);
  assert.equal(createUserSchema.safeParse({ ...alta, id_tipo_documento: null, numeroDocumento: null }).success, true);
  assert.equal(createUserSchema.safeParse({ ...alta, numeroDocumento: '' }).success, true);
  assert.equal(createUserSchema.safeParse({ ...alta, id_tipo_documento: 1 }).success, false);
  assert.equal(createUserSchema.safeParse({ ...alta, numeroDocumento: '12345678Z' }).success, false);
  assert.equal(createUserSchema.safeParse({ ...alta, id_tipo_documento: 1, numeroDocumento: null }).success, false);
  const creado = createUserSchema.parse({ ...alta, id_tipo_documento: 1, numeroDocumento: ' 12345678z ' });
  assert.equal(creado.id_tipo_documento, 1);
  assert.equal(creado.numeroDocumento, '12345678Z');
  assert.equal(updateUserSchema.safeParse({ id_tipo_documento: null, numeroDocumento: null }).success, true);
  assert.equal(updateUserSchema.safeParse({ id_tipo_documento: 1, numeroDocumento: null }).success, false);
  assert.equal(updateUserSchema.safeParse({ nombre: 'Ana' }).success, true);
  assert.equal(registroSchema.safeParse({
    nombre: 'Ana', email: 'ana@example.test', password: 'Clave123',
  }).success, false);
});

test('Tipos desconocidos y límite de almacenamiento de SolicitudAlta', () => {
  assert.equal(documentoUsuarioSchema.safeParse({ id_tipo_documento: 5, numeroDocumento: 'AB12345' }).success, false);
  assert.equal(oauthRegisterSchema.safeParse({ id_tipo_documento: 4, numeroDocumento: 'A'.repeat(21), nombre: 'Ana', socio: false }).success, false);
});
