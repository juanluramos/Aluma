import { prisma } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { RegistrationIdentity } from '../../utils/registration-token.js';
export function findSolicitud(identity: RegistrationIdentity, db: Prisma.TransactionClient = prisma) {
  return db.solicitudAlta.findUnique({ where: { proveedor_external_id: { proveedor: identity.proveedor, external_id: identity.external_id } }, include: { EstadoSolicitud: true } });
}
export function getSolicitud(id: number, db: Prisma.TransactionClient = prisma) {
  return db.solicitudAlta.findUnique({ where: { id_solicitud: id }, include: { EstadoSolicitud: true } });
}
export function listSolicitudes(skip: number, take: number) {
  return prisma.solicitudAlta.findMany({ skip, take, orderBy: { id_solicitud: 'desc' }, include: { EstadoSolicitud: true } });
}
export function createSolicitud(data: Prisma.SolicitudAltaUncheckedCreateInput, db: Prisma.TransactionClient) {
  return db.solicitudAlta.create({ data, include: { EstadoSolicitud: true } });
}
export function resolveSolicitud(id: number, data: Prisma.SolicitudAltaUncheckedUpdateInput, db: Prisma.TransactionClient) {
  return db.solicitudAlta.update({ where: { id_solicitud: id }, data, include: { EstadoSolicitud: true } });
}
export async function lockSolicitud(id: number, db: Prisma.TransactionClient) {
  await db.$queryRaw`SELECT id_solicitud FROM SolicitudAlta WHERE id_solicitud = ${id} FOR UPDATE`;
}
