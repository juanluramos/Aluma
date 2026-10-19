import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/config/prisma.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import { updateActivitySchema } from '../src/dtos/actividad/update-activity.dto.js';
import { updateExistingActivity } from '../src/services/actividad/service.js';

// Ejecuta DTO, servicio, repositorio y auditoría reales con persistencia en memoria.
// No abre conexiones ni escribe en la base de datos.
for (const [antes, recibido, esperado] of [
  [20, 30, 30], [20, 10, 10], [20, null, null], [null, 20, 20],
  [20, undefined, 20], [null, undefined, null], [20, 20, 20],
] as const) {
  test(`actualizar aforo ${antes} con ${recibido}: resultado ${esperado}`, async (t) => {
    let row = {
      id_actividad: 1, titulo: 'Taller', aforo: antes as number | null,
      fecha: null, importeSocio: null, importeNoSocio: null,
      id_estado_actividad: 1, comentario: null,
    };
    const audits: Prisma.AuditoriaCreateInput[] = [];
    let updateData: Prisma.ActividadUpdateInput | undefined;
    let lecturas = 0;
    const tx = {
      $queryRaw: async () => {
        lecturas += 1;
        if (lecturas === 1) return [{ id_actividad: row.id_actividad, aforo: row.aforo }];
        return [];
      },
      estadoPago: {
        findUnique: async ({ where }: { where: { nombre_estado?: string } }) => ({
          id_estado_pago: where.nombre_estado === 'Pagado' ? 2 : 1,
          nombre_estado: where.nombre_estado ?? 'Pendiente',
        }),
      },
      estadoInscripcion: {
        findUnique: async () => ({ id_estado_inscripcion: 1, nombre: 'Activa' }),
      },
      actividad: {
        findUnique: async () => ({ ...row }),
        update: async ({ data }: { data: Prisma.ActividadUpdateInput }) => {
          updateData = data;
          if (data.aforo !== undefined) {
            assert.ok(data.aforo === null || typeof data.aforo === 'number');
            row = { ...row, aforo: data.aforo };
          }
          return { ...row };
        },
      },
      auditoria: {
        create: async ({ data }: { data: Prisma.AuditoriaCreateInput }) => {
          audits.push(data);
          return data;
        },
      },
    };
    const originalTransaction = prisma.$transaction;
    t.after(() => { prisma.$transaction = originalTransaction; });
    prisma.$transaction = (async (
      operation: (client: Prisma.TransactionClient) => Promise<unknown>,
      options: { isolationLevel: string },
    ) => {
      assert.equal(options.isolationLevel, 'Serializable');
      return operation(tx as unknown as Prisma.TransactionClient);
    }) as typeof prisma.$transaction;
    const dto = updateActivitySchema.parse({ comentario: null, aforo: recibido });
    const result = await updateExistingActivity(1, dto, {
      requestId: randomUUID(), id_usuario: 1, rol_actor: 'Operador',
    });
    assert.equal(result.aforo, esperado);
    assert.equal(row.aforo, esperado);
    assert.equal(Object.hasOwn(updateData!, 'aforo'), recibido !== undefined);
    if (antes !== esperado) {
      assert.equal(audits.length, 1);
      assert.equal(audits[0]!.accion, 'ACTIVIDAD_MODIFICADA');
      assert.deepEqual(audits[0]!.detalles, { cambios: { aforo: { anterior: antes, nuevo: esperado } } });
    } else {
      assert.equal(audits.length, 0);
    }
  });
}
