import { prisma } from '../../config/prisma.js';
export async function createAudit(data, client = prisma) {
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
export async function getAuditById(id, client = prisma) {
    return client.auditoria.findUnique({ where: { id_auditoria: id } });
}
export async function getAllAudits(client = prisma) {
    return client.auditoria.findMany({
        orderBy: [{ fecha_evento: 'asc' }, { id_auditoria: 'asc' }],
    });
}
//# sourceMappingURL=repository.js.map