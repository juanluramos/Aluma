import type { AuthTokenPayload } from "../middlewares/auth/authenticate.middleware.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
      requestId: string;
    }
  }
}

export {};
