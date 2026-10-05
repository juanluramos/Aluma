import { z } from 'zod';
export { oauthRegisterSchema as createSolicitudSchema } from '../auth/oauth-register.dto.js';
export const resolveSolicitudSchema = z.discriminatedUnion('decision', [
    z.strictObject({ decision: z.literal('Aceptar') }),
    z.strictObject({ decision: z.literal('Rechazar'), motivo: z.string().trim().min(1).max(500) }),
]);
//# sourceMappingURL=dto.js.map