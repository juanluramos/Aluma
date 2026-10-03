import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/config/prisma.js';
import { AppError } from '../src/errors/app-error.js';
import { createAudit } from '../src/services/auditoria/service.js';
import type { CreateAuditInput } from '../src/services/auditoria/service.js';
import { getAuditById } from '../src/repositories/auditoria/repository.js';

test('Service de auditoria aislado', async (t) => {
  const requestIds: string[] = [];
  function fixture(): CreateAuditInput {
    const requestId = randomUUID();
    requestIds.push(requestId);
    return {
      requestId, accion: 'USUARIO_CREADO', recurso: 'USUARIO', resultado: 'REALIZADA',
    };
  }

  async function expectInvalid(data: unknown) {
    const before = await prisma.auditoria.count({ where: { requestId: { in: requestIds } } });
    await assert.rejects(createAudit(data as CreateAuditInput), error =>
      error instanceof AppError && error.statusCode === 400 && error.code === 'AUDIT_VALIDATION_ERROR');
    assert.equal(await prisma.auditoria.count({ where: { requestId: { in: requestIds } } }), before);
  }

  try {
    await t.test('Crea REALIZADA conservando los datos recibidos', async () => {
      const data: CreateAuditInput = {
        ...fixture(), id_usuario: 123456, rol_actor: 'Operador', id_recurso: 654321,
      };
      const audit = await createAudit(data);
      assert.equal(audit.requestId, data.requestId);
      assert.equal(audit.id_usuario, data.id_usuario);
      assert.equal(audit.rol_actor, data.rol_actor);
      assert.equal(audit.id_recurso, data.id_recurso);
      assert.equal(audit.accion, data.accion);
      assert.equal(audit.recurso, data.recurso);
      assert.equal(audit.resultado, 'REALIZADA');
      assert.equal(audit.codigo_error, null);
      assert.equal(audit.detalles, null);
      assert.deepEqual(await getAuditById(audit.id_auditoria), audit);
    });

    await t.test('Crea RECHAZADA con codigo de error', async () => {
      const audit = await createAudit({
        ...fixture(), accion: 'LOGIN_RECHAZADO', recurso: 'AUTENTICACION',
        resultado: 'RECHAZADA', codigo_error: 'INVALID_CREDENTIALS',
      });
      assert.equal(audit.resultado, 'RECHAZADA');
      assert.equal(audit.codigo_error, 'INVALID_CREDENTIALS');
    });

    for (const field of ['accion', 'recurso', 'resultado']) {
      await t.test(`Rechaza ${field} invalido sin persistir`, async () => {
        await expectInvalid({ ...fixture(), [field]: 'INVALIDO' });
      });
    }

    await t.test('Permite omitir actor y recurso concreto', async () => {
      const audit = await createAudit({
        ...fixture(), accion: 'ACCESO_RECHAZADO', recurso: 'PETICION_HTTP', resultado: 'RECHAZADA',
      });
      assert.equal(audit.id_usuario, null);
      assert.equal(audit.rol_actor, null);
      assert.equal(audit.id_recurso, null);
      assert.equal(audit.codigo_error, null);
    });

    await t.test('Permite null explicito en todos los campos opcionales', async () => {
      const audit = await createAudit({
        ...fixture(), id_usuario: null, rol_actor: null, id_recurso: null,
        codigo_error: null, detalles: null,
      });
      for (const field of ['id_usuario', 'rol_actor', 'id_recurso', 'codigo_error', 'detalles'] as const) {
        assert.equal(audit[field], null);
      }
    });

    await t.test('Conserva el objeto JSON sin serializarlo a string', async () => {
      const detalles = {
        importe: '10.00', id_movimiento: 18, prueba: true,
        referencia: null, seleccion: { ids: [1, 2] },
      };
      const audit = await createAudit({ ...fixture(), detalles });
      assert.deepEqual((await getAuditById(audit.id_auditoria))?.detalles, detalles);
    });

    await t.test('Rechaza requestId ausente, vacio o no UUID', async () => {
      const { requestId, ...rest } = fixture();
      await expectInvalid(rest);
      await expectInvalid({ ...rest, requestId: '' });
      await expectInvalid({ ...rest, requestId: 'no-es-un-uuid' });
      assert(requestId);
    });

    await t.test('Valida limites de columnas, objeto JSON y campos desconocidos', async () => {
      const data = fixture();
      for (const fields of [
        { id_usuario: -1 }, { id_usuario: 1.5 }, { id_recurso: 2147483648 },
        { rol_actor: 'x'.repeat(31) }, { codigo_error: 'x'.repeat(65) },
        { detalles: 'texto' }, { detalles: [] }, { detalles: { importe: 1n } },
        { detalles: { indefinido: undefined } }, { body: { prueba: true } },
      ]) await expectInvalid({ ...data, ...fields });
    });

    await t.test('Usa tx: visible dentro de la transaccion y revertida con rollback externo', async () => {
      const rollback = new Error('rollback de prueba');
      let id = 0n;
      await assert.rejects(prisma.$transaction(async (tx) => {
        const audit = await createAudit(fixture(), tx);
        id = audit.id_auditoria;
        assert.deepEqual(await getAuditById(id, tx), audit);
        assert.equal(await getAuditById(id), null);
        throw rollback;
      }), error => error === rollback);
      assert(id > 0n);
      assert.equal(await getAuditById(id), null);
    });

    await t.test('Persiste cuando la transaccion externa confirma', async () => {
      const audit = await prisma.$transaction(tx => createAudit(fixture(), tx));
      assert.deepEqual(await getAuditById(audit.id_auditoria), audit);
    });
  } finally {
    try {
      // Solo fixtures de Auditoria identificadas por UUIDs de esta ejecucion.
      await prisma.auditoria.deleteMany({ where: { requestId: { in: requestIds } } });
      assert.equal(await prisma.auditoria.count({ where: { requestId: { in: requestIds } } }), 0);
    } finally {
      await prisma.$disconnect();
    }
  }
});
