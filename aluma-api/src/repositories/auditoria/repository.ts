import { prisma } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';

export type CreateAuditData = Pick<Prisma.AuditoriaCreateInput,
  'requestId' | 'id_usuario' | 'rol_actor' | 'accion' | 'recurso' |
  'id_recurso' | 'resultado' | 'codigo_error' | 'detalles'
>;

export async function createAudit(data: CreateAuditData, client: Prisma.TransactionClient = prisma) {
  return client.auditoria.create({
    data: {
      requestId: data.requestId,
      accion: data.accion,
      recurso: data.recurso,
      resultado: data.resultado,
      ...(data.id_usuario !== undefined && { id_usuario: data.id_usuario }),
      ...(data.rol_actor !== undefined && { rol_actor: data.rol_actor }),
      ...(data.id_recurso !== undefined && { id_recurso: data.id_recurso }),
      ...(data.codigo_error !== undefined && { codigo_error: data.codigo_error }),
      ...(data.detalles !== undefined && { detalles: data.detalles }),
    },
  });
}

export async function getAuditById(id: bigint, client: Prisma.TransactionClient = prisma) {
  return client.auditoria.findUnique({ where: { id_auditoria: id } });
}

export async function getAllAudits(client: Prisma.TransactionClient = prisma) {
  return client.auditoria.findMany({
    orderBy: [{ fecha_evento: 'asc' }, { id_auditoria: 'asc' }],
  });
}
