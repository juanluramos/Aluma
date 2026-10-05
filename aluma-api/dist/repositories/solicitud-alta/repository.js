import { prisma } from '../../config/prisma.js';
export function findSolicitud(identity, db = prisma) {
    return db.solicitudAlta.findUnique({ where: { proveedor_external_id: { proveedor: identity.proveedor, external_id: identity.external_id } }, include: { EstadoSolicitud: true } });
}
export function getSolicitud(id, db = prisma) {
    return db.solicitudAlta.findUnique({ where: { id_solicitud: id }, include: { EstadoSolicitud: true } });
}
export function listSolicitudes(skip, take) {
    return prisma.solicitudAlta.findMany({ skip, take, orderBy: { id_solicitud: 'desc' }, include: { EstadoSolicitud: true } });
}
export function createSolicitud(data, db) {
    return db.solicitudAlta.create({ data, include: { EstadoSolicitud: true } });
}
export function resolveSolicitud(id, data, db) {
    return db.solicitudAlta.update({ where: { id_solicitud: id }, data, include: { EstadoSolicitud: true } });
}
export async function lockSolicitud(id, db) {
    await db.$queryRaw `SELECT id_solicitud FROM SolicitudAlta WHERE id_solicitud = ${id} FOR UPDATE`;
}
//# sourceMappingURL=repository.js.map