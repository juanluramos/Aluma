import "dotenv/config";

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error("JWT_SECRET no está configurado");
}

export const JWT_SECRET = jwtSecret;