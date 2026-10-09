import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createSessionRecord, refreshSessionRecord, revokeSessionRecord } from '../../repositories/auth/session.repository.js';
import { generateToken } from '../../utils/jwt.js';
import { SESSION_IDLE_MS } from '../../config/session.js';
import { AppError } from '../../errors/app-error.js';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const validRefresh = (value) => !!value && /^[a-f0-9]{64}$/.test(value);
export async function startSession(actor) {
    const refreshToken = randomBytes(32).toString('hex');
    const session = await createSessionRecord(randomUUID(), actor.id_usuario, hash(refreshToken), new Date());
    return { token: generateToken({ ...actor, sid: session.id }), refreshToken, expiresAt: session.expiresAt };
}
export async function refreshSession(refreshToken, activity, activityAgeMs = 0) {
    if (!validRefresh(refreshToken))
        throw new AppError('Sesión caducada', 401, 'SESSION_EXPIRED');
    if (activity && (!Number.isFinite(activityAgeMs) || activityAgeMs < 0 || activityAgeMs >= SESSION_IDLE_MS)) {
        throw new AppError('Actividad inválida o caducada', 401, 'SESSION_EXPIRED');
    }
    const now = new Date();
    const session = await refreshSessionRecord(hash(refreshToken), activity, now, new Date(now.getTime() - activityAgeMs));
    if (!session || !['Usuario', 'Operador', 'Administrador'].includes(session.Usuario.RolUsuario.nombre_rol)) {
        throw new AppError('Sesión caducada o revocada', 401, 'SESSION_EXPIRED');
    }
    return {
        token: generateToken({ id_usuario: session.id_usuario, rol: session.Usuario.RolUsuario.nombre_rol, sid: session.id }),
        refreshToken, expiresAt: session.expiresAt,
    };
}
export async function endSession(refreshToken) {
    if (validRefresh(refreshToken))
        await revokeSessionRecord(hash(refreshToken));
}
//# sourceMappingURL=session.service.js.map