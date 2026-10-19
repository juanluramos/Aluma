import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseDePruebasRechazada } from '../src/config/base-de-pruebas.js';
import { prisma } from '../src/config/prisma.js';

test('sin autorización el cliente de pruebas no abre aluma', async () => {
  delete process.env.ALUMA_AUTORIZAR_PRUEBAS_ALUMA;
  process.env.DATABASE_HOST = 'pruebas.invalid';
  process.env.DATABASE_PORT = '3306';
  process.env.DATABASE_NAME = 'aluma';
  await assert.rejects(async () => {
    await prisma.usuario.findMany();
  }, (error: unknown) => error instanceof BaseDePruebasRechazada);
});
