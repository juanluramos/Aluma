import "dotenv/config";

export const ACCESS_TOKEN_SECONDS = 15 * 60;
export const SESSION_IDLE_MS = 60 * 60 * 1000;
export const FRONTEND_ORIGIN = new URL(process.env.FRONTEND_URL ?? 'http://localhost:5173').origin;
export const REFRESH_COOKIE = 'aluma_refresh';
