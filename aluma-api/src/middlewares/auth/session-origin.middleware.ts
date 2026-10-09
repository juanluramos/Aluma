import type { Request, Response, NextFunction } from 'express';
import { FRONTEND_ORIGIN } from '../../config/session.js';

export function checkAuthOrigin(req: Request, res: Response, next: NextFunction) {
  const origin = req.get('Origin');
  if ((origin && origin !== FRONTEND_ORIGIN) || req.get('Sec-Fetch-Site') === 'cross-site') {
    res.status(403).json({ message: 'Origen no permitido', code: 'INVALID_ORIGIN' });
    return;
  }
  next();
}
export function requireSessionHeader(req: Request, res: Response, next: NextFunction) {
  // Non-simple header forces a CORS preflight; forms cannot perform these operations.
  if (req.get('X-Aluma-Session') !== '1') {
    res.status(403).json({ message: 'Cabecera de sesión requerida', code: 'INVALID_SESSION_REQUEST' });
    return;
  }
  next();
}
