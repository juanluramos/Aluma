import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client.js";
import { extensionAislamiento } from "./aislamiento-pruebas.js";
import { exigirPruebasEnAluma, esProcesoDePrueba } from "./base-de-pruebas.js";

function clienteDeAplicacion(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: process.env.DATABASE_HOST!,
      port: Number(process.env.DATABASE_PORT ?? 3306),
      user: process.env.DATABASE_USER!,
      password: process.env.DATABASE_PASSWORD!,
      database: process.env.DATABASE_NAME!,
      connectionLimit: 5,
    }),
  });
}

function clienteDePruebas() {
  const conexion = exigirPruebasEnAluma(process.env);
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: conexion.host,
      port: conexion.port,
      user: conexion.user,
      password: conexion.password,
      database: conexion.database,
      connectionLimit: 5,
    }),
  }).$extends(extensionAislamiento());
}

const reemplazos = new Map<PropertyKey, unknown>();
let cliente: ReturnType<typeof clienteDePruebas> | undefined;

function clienteReal(): ReturnType<typeof clienteDePruebas> {
  if (!cliente) cliente = clienteDePruebas();
  return cliente;
}

function metodoDiferido(propiedad: PropertyKey) {
  return (...args: unknown[]) => {
    const real = clienteReal();
    const valor = Reflect.get(real, propiedad, real) as (...args: unknown[]) => unknown;
    return valor.apply(real, args);
  };
}

function delegadoDiferido(modelo: PropertyKey) {
  return new Proxy({}, {
    get(_objetivo, metodo) {
      return (...args: unknown[]) => {
        const real = clienteReal();
        const delegado = Reflect.get(real, modelo, real) as object;
        const valor = Reflect.get(delegado, metodo, delegado) as (...args: unknown[]) => unknown;
        return valor.apply(delegado, args);
      };
    },
  });
}

function prismaDePruebas(): PrismaClient {
  return new Proxy({} as PrismaClient, {
    get(_objetivo, propiedad) {
      if (reemplazos.has(propiedad)) return reemplazos.get(propiedad);
      if (propiedad === "$disconnect") return () => cliente?.$disconnect();
      if (typeof propiedad !== "string" || propiedad === "then") return undefined;
      return propiedad.startsWith("$") ? metodoDiferido(propiedad) : delegadoDiferido(propiedad);
    },
    set(_objetivo, propiedad, valor) {
      reemplazos.set(propiedad, valor);
      return true;
    },
  });
}

// La aplicación abre aluma al importar este módulo.
// Un proceso de pruebas no abre la conexión hasta comprobar la autorización.
export const prisma = esProcesoDePrueba() ? prismaDePruebas() : clienteDeAplicacion();
