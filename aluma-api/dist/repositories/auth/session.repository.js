import { prisma } from '../../config/prisma.js';
import { SESSION_IDLE_MS } from '../../config/session.js';
const userInclude = { Usuario: { include: { EstadoUsuario: true, RolUsuario: true } } };
export function createSessionRecord(id, id_usuario, refreshHash, now) {
    return prisma.sesionAutenticacion.create({ data: {
            id, id_usuario, refreshHash, lastActivityAt: now,
            expiresAt: new Date(now.getTime() + SESSION_IDLE_MS),
        } });
}
export function findActiveSession(id, id_usuario, now = new Date()) {
    return prisma.sesionAutenticacion.findFirst({ where: {
            id, id_usuario, revokedAt: null, expiresAt: { gt: now },
            lastActivityAt: { gt: new Date(now.getTime() - SESSION_IDLE_MS) },
        } });
}
export async function refreshSessionRecord(refreshHash, activity, now, activityAt = now) {
    // The conditional write cannot resurrect an expired/revoked session, including
    // when logout and refresh reach different API instances at the same time.
    return prisma.$transaction(async (tx) => {
        const where = {
            refreshHash, revokedAt: null, expiresAt: { gt: now },
            lastActivityAt: { gt: new Date(now.getTime() - SESSION_IDLE_MS) },
            Usuario: { EstadoUsuario: { permiteLogin: true } },
        };
        if (activity) {
            await tx.sesionAutenticacion.updateMany({
                where: { ...where, lastActivityAt: { gt: new Date(now.getTime() - SESSION_IDLE_MS), lt: activityAt } },
                data: { lastActivityAt: activityAt, expiresAt: new Date(activityAt.getTime() + SESSION_IDLE_MS) },
            });
        }
        return tx.sesionAutenticacion.findFirst({ where, include: userInclude });
    });
}
export function revokeSessionRecord(refreshHash) {
    return prisma.sesionAutenticacion.updateMany({
        where: { refreshHash, revokedAt: null }, data: { revokedAt: new Date() },
    });
}
//# sourceMappingURL=session.repository.js.map