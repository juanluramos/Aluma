import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/config/prisma.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { createAudit, getAuditById, getAllAudits } from '../src/repositories/auditoria/repository.js';
import type { CreateAuditData } from '../src/repositories/auditoria/repository.js';

test('Repository de auditoria: persistencia, lectura y transacciones', async (t) => {
  const requestIds: string[] = [];
  function fixture(): CreateAuditData {
    const requestId = randomUUID();
    requestIds.push(requestId);
    return {
      requestId, id_usuario: 1, rol_actor: 'Usuario',
      accion: 'INSCRIPCION_CREADA', recurso: 'INSCRIPCION_ACTIVIDAD',
      id_recurso: 1, resultado: 'REALIZADA', codigo_error: null,
    };
  }
  let completedId = 0n;
  let rejectedId = 0n;
  const details = { importe: '10.00', id_movimiento: 18, prueba: true };

  try {
    await t.test('Crea REALIZADA con cliente global por defecto', async () => {
      const data = { ...fixture(), detalles: details };
      const created = await createAudit(data);
      completedId = created.id_auditoria;
      assert.equal(typeof completedId, 'bigint');
      assert(completedId > 0n);
      assert(created.fecha_evento instanceof Date);
      assert.equal(created.requestId, data.requestId);
      assert.equal(created.id_usuario, data.id_usuario);
      assert.equal(created.rol_actor, data.rol_actor);
      assert.equal(created.accion, data.accion);
      assert.equal(created.recurso, data.recurso);
      assert.equal(created.id_recurso, data.id_recurso);
      assert.equal(created.resultado, 'REALIZADA');
      assert.equal(created.codigo_error, null);
    });

    await t.test('Crea RECHAZADA con codigo de error y actor/recurso nulos', async () => {
      const created = await createAudit({
        ...fixture(), id_usuario: null, rol_actor: null, id_recurso: null,
        accion: 'LOGIN_RECHAZADO', recurso: 'AUTENTICACION',
        resultado: 'RECHAZADA', codigo_error: 'INVALID_CREDENTIALS',
        detalles: Prisma.DbNull,
      }, prisma);
      rejectedId = created.id_auditoria;
      assert.equal(created.resultado, 'RECHAZADA');
      assert.equal(created.codigo_error, 'INVALID_CREDENTIALS');
      assert.equal(created.id_usuario, null);
      assert.equal(created.rol_actor, null);
      assert.equal(created.id_recurso, null);
      assert.equal(created.detalles, null);
    });

    await t.test('Lee por bigint y devuelve null para un ID inexistente', async () => {
      const created = await getAuditById(completedId);
      assert.equal(created?.id_auditoria, completedId);
      assert.equal((await getAuditById(rejectedId))?.resultado, 'RECHAZADA');
      assert.equal(await getAuditById(0n), null);
    });

    await t.test('Conserva el JSON despues de persistirlo y leerlo', async () => {
      const created = await getAuditById(completedId);
      assert.deepEqual(created?.detalles, details);
    });

    await t.test('Lista por fecha_evento ascendente y desempata por id_auditoria', async () => {
      const rollback = new Error('rollback de fixtures cronologicas');
      await assert.rejects(prisma.$transaction(async (tx) => {
        const data = fixture();
        // Fechas controladas solo en fixtures; el repository no recibe fecha_evento.
        const later = await tx.auditoria.create({ data: { ...data, fecha_evento: new Date('2001-01-02T00:00:00Z') } });
        const earlier = await tx.auditoria.create({ data: { ...data, fecha_evento: new Date('2001-01-01T00:00:00Z') } });
        const sameDate = await tx.auditoria.create({ data: { ...data, fecha_evento: earlier.fecha_evento } });
        const rows = await getAllAudits(tx);
        assert(rows.some(row => row.id_auditoria === completedId));
        assert(rows.some(row => row.id_auditoria === rejectedId));
        for (let i = 1; i < rows.length; i++) {
          const before = rows[i - 1]!;
          const after = rows[i]!;
          assert(before.fecha_evento.getTime() < after.fecha_evento.getTime() ||
            (before.fecha_evento.getTime() === after.fecha_evento.getTime() && before.id_auditoria < after.id_auditoria));
        }
        assert.deepEqual(rows.filter(row => row.requestId === data.requestId).map(row => row.id_auditoria),
          [earlier.id_auditoria, sameDate.id_auditoria, later.id_auditoria]);
        throw rollback;
      }), error => error === rollback);
      assert((await getAllAudits()).some(row => row.id_auditoria === completedId));
    });

    await t.test('Usa exactamente tx: el rollback externo revierte la auditoria', async () => {
      const data = fixture();
      const rollback = new Error('rollback externo');
      let id = 0n;
      await assert.rejects(prisma.$transaction(async (tx) => {
        const created = await createAudit(data, tx);
        id = created.id_auditoria;
        assert.deepEqual(await getAuditById(id, tx), created);
        assert.equal(await getAuditById(id), null);
        throw rollback;
      }), error => error === rollback);
      assert(id > 0n);
      assert.equal(await getAuditById(id), null);
    });

    await t.test('El commit externo persiste la auditoria y admite detalles omitidos', async () => {
      const data = fixture();
      const created = await prisma.$transaction(tx => createAudit(data, tx));
      assert.deepEqual(await getAuditById(created.id_auditoria), created);
      assert.equal(created.detalles, null);
    });
  } finally {
    try {
      // Limpieza exclusiva de Auditoria por UUIDs creados por esta ejecucion.
      // No se borran datos de negocio ni se expone DELETE en el repository.
      await prisma.auditoria.deleteMany({ where: { requestId: { in: requestIds } } });
      assert.equal(await prisma.auditoria.count({ where: { requestId: { in: requestIds } } }), 0);
    } finally {
      await prisma.$disconnect();
    }
  }
});
