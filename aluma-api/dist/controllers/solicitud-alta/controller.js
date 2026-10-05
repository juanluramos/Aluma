import { z } from 'zod';
import { verifyRegistrationToken } from '../../utils/registration-token.js';
import { createSolicitudSchema, resolveSolicitudSchema } from '../../dtos/solicitud-alta/dto.js';
import { submitSolicitud, getOwnSolicitud, resolveApplication } from '../../services/solicitud-alta/service.js';
import { listSolicitudes, getSolicitud } from '../../repositories/solicitud-alta/repository.js';
import { AppError } from '../../errors/app-error.js';
function id(req) {
    const value = Number(req.params.id);
    if (!Number.isSafeInteger(value) || value <= 0 || value > 2147483647)
        throw new AppError('ID inválido', 400, 'INVALID_ID');
    return value;
}
export async function submit(req, res) {
    const identity = verifyRegistrationToken(req.headers.authorization);
    const parsed = createSolicitudSchema.safeParse(req.body);
    if (!parsed.success)
        throw new AppError('Datos de solicitud no válidos', 400, 'VALIDATION_ERROR');
    res.status(201).json(await submitSolicitud(identity, parsed.data));
}
export async function own(req, res) {
    res.json(await getOwnSolicitud(verifyRegistrationToken(req.headers.authorization)));
}
export async function list(req, res) {
    const parsed = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).safeParse(req.query);
    if (!parsed.success)
        throw new AppError('Paginación inválida', 400, 'VALIDATION_ERROR');
    res.json(await listSolicitudes((parsed.data.page - 1) * parsed.data.limit, parsed.data.limit));
}
export async function detail(req, res) {
    const row = await getSolicitud(id(req));
    if (!row)
        throw new AppError('Solicitud no encontrada', 404, 'APPLICATION_NOT_FOUND');
    res.json(row);
}
export async function resolve(req, res) {
    const parsed = resolveSolicitudSchema.safeParse(req.body);
    if (!parsed.success)
        throw new AppError('Resolución no válida', 400, 'VALIDATION_ERROR');
    if (!req.user)
        throw new AppError('No autenticado', 401, 'AUTHENTICATION_REQUIRED');
    res.json(await resolveApplication(id(req), req.user.id_usuario, parsed.data));
}
//# sourceMappingURL=controller.js.map