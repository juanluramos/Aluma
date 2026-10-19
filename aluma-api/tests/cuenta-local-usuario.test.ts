import test from 'node:test';
import assert from 'node:assert/strict';
import { createUserSchema } from '../src/dtos/usuario/create-user.dto.js';
import { updateUserSchema } from '../src/dtos/usuario/update-user.dto.js';
import { operadorPuedeDarDeAlta } from '../src/middlewares/auth/authorize-user-create.middleware.js';
import { decisionPasswordEdicion, passwordDeAlta, rolConCuentaLocal } from '../src/services/usuario/service.js';

const alta = {
  nombre: 'Ana',
  email: 'ana@example.test',
  id_rol: 1,
  socio: false,
  id_estado_usuario: 1,
  matriculaPagada: false,
};

test('El alta de un Usuario admite un email vacío; Operador y Administrador no', () => {
  const sinEmail = { ...alta };
  delete (sinEmail as { email?: string }).email;
  assert.equal(createUserSchema.parse(sinEmail).email, undefined);
  assert.equal(createUserSchema.parse({ ...sinEmail, email: '' }).email, null);
  assert.equal(createUserSchema.parse({ ...sinEmail, email: ' ANA@EJEMPLO.TEST ' }).email, 'ana@ejemplo.test');
  assert.equal(createUserSchema.safeParse({ ...sinEmail, email: 'no-es-email' }).success, false);
  for (const id_rol of [2, 3]) {
    assert.equal(createUserSchema.safeParse({ ...sinEmail, id_rol, password: 'Clave123' }).success, false);
    assert.equal(createUserSchema.parse({ ...alta, id_rol, password: 'Clave123' }).email, 'ana@example.test');
  }
  assert.equal(updateUserSchema.parse({ email: '' }).email, null);
  assert.equal(updateUserSchema.safeParse({ email: 'no-es-email' }).success, false);
});

test('Operador crea Usuario sin contraseña y no abre cuenta local', () => {
  const creado = createUserSchema.parse(alta);
  assert.equal(creado.password, undefined);
  assert.equal(passwordDeAlta('Usuario', creado.password), undefined);
  assert.equal(rolConCuentaLocal('Usuario'), false);
  assert.equal(operadorPuedeDarDeAlta({
    nombreRol: 'Usuario', nombreEstado: 'Activo', socio: false, matriculaPagada: false,
  }), true);
});

test('Operador no puede crear Operador ni Administrador', () => {
  for (const nombreRol of ['Operador', 'Administrador']) {
    assert.equal(operadorPuedeDarDeAlta({
      nombreRol, nombreEstado: 'Activo', socio: false, matriculaPagada: false,
    }), false, nombreRol);
  }
  assert.equal(operadorPuedeDarDeAlta({
    nombreRol: 'Usuario', nombreEstado: 'Inactivo', socio: false, matriculaPagada: false,
  }), true);
  assert.equal(operadorPuedeDarDeAlta({
    nombreRol: 'Usuario', nombreEstado: 'Pendiente', socio: false, matriculaPagada: false,
  }), false);
  assert.equal(operadorPuedeDarDeAlta({
    nombreRol: 'Usuario', nombreEstado: 'Activo', socio: true, matriculaPagada: true,
  }), true);
});

test('Administrador crea Usuario sin contraseña y descarta una contraseña enviada por error', () => {
  assert.equal(createUserSchema.parse(alta).password, undefined);
  const conPassword = createUserSchema.parse({ ...alta, password: 'no-importa' });
  assert.equal(passwordDeAlta('Usuario', conPassword.password), undefined);
  assert.equal(rolConCuentaLocal('Usuario'), false);
});

test('Administrador no crea Operador ni Administrador sin contraseña válida', () => {
  for (const id_rol of [2, 3]) {
    assert.equal(createUserSchema.safeParse({ ...alta, id_rol }).success, false, String(id_rol));
    assert.equal(createUserSchema.safeParse({ ...alta, id_rol, password: 'corta' }).success, false);
    const creado = createUserSchema.parse({ ...alta, id_rol, password: 'Clave123' });
    assert.equal(creado.password, 'Clave123');
    assert.equal(passwordDeAlta(id_rol === 2 ? 'Operador' : 'Administrador', creado.password), 'Clave123');
  }
  assert.equal(rolConCuentaLocal('Operador'), true);
  assert.equal(rolConCuentaLocal('Administrador'), true);
});

test('Una edición parcial no exige contraseña ni fecha', () => {
  const parcial = updateUserSchema.parse({ nombre: 'Ana' });
  assert.equal(Object.hasOwn(parcial, 'password'), false);
  assert.equal(Object.hasOwn(parcial, 'fechaInscripcion'), false);
  assert.equal(updateUserSchema.safeParse({}).success, false);
  assert.equal(updateUserSchema.parse({ nombre: 'Ana', password: '' }).password, '');
  assert.equal(updateUserSchema.safeParse({ nombre: 'Ana', password: 'corta' }).success, false);
  assert.equal(updateUserSchema.parse({ nombre: 'Ana', password: 'Clave123' }).password, 'Clave123');
});

test('Editar la contraseña de un operador la aplica; la de un usuario no abre cuenta', () => {
  assert.equal(decisionPasswordEdicion('Administrador', 'Operador', 'Clave123'), 'aplicar');
  assert.equal(decisionPasswordEdicion('Administrador', 'Administrador', 'Clave123'), 'aplicar');
  assert.equal(decisionPasswordEdicion('Operador', 'Operador', 'Clave123'), 'aplicar');
  assert.equal(decisionPasswordEdicion('Operador', 'Administrador', 'Clave123'), 'prohibido');
  assert.equal(decisionPasswordEdicion('Administrador', 'Usuario', 'Clave123'), 'ignorar');
  assert.equal(decisionPasswordEdicion('Administrador', 'Operador', undefined), 'ignorar');
});
