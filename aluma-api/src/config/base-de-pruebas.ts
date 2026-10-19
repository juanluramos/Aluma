export const BASE_REAL = "aluma";
export const BASE_PRUEBAS = "aluma_test";
export const AUTORIZACION_INTEGRACION = "ALUMA_AUTORIZAR_PRUEBAS_ALUMA";

export class BaseDePruebasRechazada extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BaseDePruebasRechazada";
  }
}

export type ConexionPrueba = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: typeof BASE_PRUEBAS;
};

export function esInvocacionDePrueba(argv: readonly string[], env: NodeJS.ProcessEnv): boolean {
  return argv.includes("--test") || env.ALUMA_PRUEBAS === "1";
}

export function esProcesoDePrueba(): boolean {
  return esInvocacionDePrueba([...process.execArgv, ...process.argv], process.env);
}

function rechazar(mensaje: string): never {
  throw new BaseDePruebasRechazada(mensaje);
}

function nombreDeUrl(url: string, variable = "DATABASE_TEST_URL"): { host: string; port: number; user: string; password: string; database: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    rechazar(`${variable} no es una URL de conexión válida.`);
  }
  if (parsed.protocol !== "mysql:" && parsed.protocol !== "mariadb:") {
    rechazar(`${variable} debe usar el protocolo mysql: o mariadb:.`);
  }
  const segmentos = parsed.pathname.split("/").filter(Boolean).map((segmento) => decodeURIComponent(segmento));
  const porParametro = parsed.searchParams.get("database") ?? parsed.searchParams.get("schema");
  if (segmentos.length !== 1 || (porParametro !== null && porParametro !== segmentos[0])) {
    rechazar(`${variable} no identifica una única base de datos.`);
  }
  const database = segmentos[0]!;
  if (!parsed.hostname || !parsed.username) {
    rechazar(`${variable} no incluye servidor o usuario.`);
  }
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
  };
}

/**
 * Lee solo las variables DATABASE_TEST_*.
 * No consulta DATABASE_NAME, DATABASE_URL ni NODE_ENV.
 */
export function exigirBaseDePruebas(env: NodeJS.ProcessEnv): ConexionPrueba {
  const nombre = env.DATABASE_TEST_NAME?.trim() ?? "";
  const url = env.DATABASE_TEST_URL?.trim() ?? "";
  if (!nombre && !url) {
    rechazar("No hay base de pruebas configurada. Define DATABASE_TEST_NAME=aluma_test.");
  }
  if (nombre === BASE_REAL) {
    rechazar("Las pruebas no pueden usar la base real aluma.");
  }
  if (nombre !== BASE_PRUEBAS) {
    rechazar("DATABASE_TEST_NAME debe ser exactamente aluma_test.");
  }

  const host = env.DATABASE_TEST_HOST?.trim() ?? "";
  const user = env.DATABASE_TEST_USER?.trim() ?? "";
  const password = env.DATABASE_TEST_PASSWORD;
  const puertoTexto = env.DATABASE_TEST_PORT?.trim() || "3306";
  const port = Number(puertoTexto);
  if (!host || !user || password === undefined || password === "") {
    rechazar("Faltan DATABASE_TEST_HOST, DATABASE_TEST_USER o DATABASE_TEST_PASSWORD.");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    rechazar("DATABASE_TEST_PORT no es un puerto válido.");
  }

  if (url) {
    const destino = nombreDeUrl(url);
    if (destino.database === BASE_REAL) {
      rechazar("DATABASE_TEST_URL apunta a la base real aluma.");
    }
    if (destino.database !== BASE_PRUEBAS || destino.host !== host || destino.port !== port || destino.user !== user || destino.password !== password) {
      rechazar("DATABASE_TEST_URL no identifica inequívocamente aluma_test.");
    }
  }

  return { host, port, user, password, database: BASE_PRUEBAS };
}

export type ConexionAluma = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: typeof BASE_REAL;
};

/**
 * Las pruebas de integración usan la base aluma de la aplicación.
 * Hace falta ALUMA_AUTORIZAR_PRUEBAS_ALUMA=1. NODE_ENV no autoriza.
 * No cambia el destino a aluma_test ni a otra base.
 */
export function exigirPruebasEnAluma(env: NodeJS.ProcessEnv): ConexionAluma {
  if (env[AUTORIZACION_INTEGRACION] !== "1") {
    rechazar("Las pruebas de integración sobre aluma requieren ALUMA_AUTORIZAR_PRUEBAS_ALUMA=1.");
  }
  const database = env.DATABASE_NAME?.trim() ?? "";
  if (database !== BASE_REAL) {
    rechazar("Las pruebas de integración solo pueden usar la base aluma.");
  }
  const host = env.DATABASE_HOST?.trim() ?? "";
  const user = env.DATABASE_USER?.trim() ?? "";
  const password = env.DATABASE_PASSWORD;
  const puertoTexto = env.DATABASE_PORT?.trim() || "3306";
  const port = Number(puertoTexto);
  if (!host || !user || password === undefined || password === "") {
    rechazar("Faltan DATABASE_HOST, DATABASE_USER o DATABASE_PASSWORD.");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    rechazar("DATABASE_PORT no es un puerto válido.");
  }
  const url = env.DATABASE_URL?.trim() ?? "";
  if (url) {
    const destino = nombreDeUrl(url, "DATABASE_URL");
    if (destino.database !== BASE_REAL || destino.host !== host || destino.port !== port || destino.user !== user || destino.password !== password) {
      rechazar("DATABASE_URL no identifica inequívocamente la base aluma.");
    }
  }
  const nombreDePrueba = env.DATABASE_TEST_NAME?.trim() ?? "";
  if (nombreDePrueba && nombreDePrueba !== BASE_REAL) {
    rechazar("La configuración no puede desviar las pruebas a otra base.");
  }
  return { host, port, user, password, database: BASE_REAL };
}
