import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client.js";

/**
 * Adaptador de conexión para MariaDB.
 *
 * Prisma 7 necesita un driver adapter para conectarse
 * directamente a la base de datos.
 */
const adapter = new PrismaMariaDb({
  host: process.env.DATABASE_HOST!,
  port: Number(process.env.DATABASE_PORT ?? 3306),
  user: process.env.DATABASE_USER!,
  password: process.env.DATABASE_PASSWORD!,
  database: process.env.DATABASE_NAME!,
  connectionLimit: 5,
});

/**
 * Instancia única de Prisma Client.
 *
 * Será reutilizada por los repositories para acceder
 * a MariaDB sin crear múltiples pools de conexiones.
 */
export const prisma = new PrismaClient({
  adapter,
});