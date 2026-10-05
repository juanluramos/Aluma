import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { JWT_SECRET } from '../config/jwt.js';
import { AppError } from '../errors/app-error.js';
const key = createHmac('sha256', JWT_SECRET).update('ALUMA:solicitud-alta:v1').digest('hex');
const identitySchema = z.object({ proveedor: z.literal('Google'), external_id: z.string().min(1).max(255), email: z.email().max(254) });
export function createRegistrationToken(identity) {
    return jwt.sign(identitySchema.parse(identity), key, { algorithm: 'HS256', expiresIn: '15m', audience: 'solicitud-alta', issuer: 'ALUMA' });
}
export function verifyRegistrationToken(authorization) {
    try {
        const parts = authorization?.split(' ');
        if (parts?.length !== 2 || parts[0] !== 'Bearer' || !parts[1])
            throw new Error();
        return identitySchema.parse(jwt.verify(parts[1], key, { algorithms: ['HS256'], audience: 'solicitud-alta', issuer: 'ALUMA' }));
    }
    catch {
        throw new AppError('Identidad de alta inválida o expirada', 401, 'INVALID_REGISTRATION_TOKEN');
    }
}
//# sourceMappingURL=registration-token.js.map