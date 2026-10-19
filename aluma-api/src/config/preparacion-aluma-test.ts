export const AUTORIZACION_PREPARACION = "ALUMA_AUTORIZAR_ALUMA_TEST";
export const AUTORIZACION_PREPARACION_ANTERIOR = "ALUMA_AUTORIZAR_ALUMAT_TEST";
export const AUTORIZACION_REINICIO = "ALUMA_AUTORIZAR_REINICIO_ALUMA_TEST";
export const AUTORIZACION_REINICIO_ANTERIOR = "ALUMA_AUTORIZAR_REINICIO_ALUMAT_TEST";

export type PasoPreparacion = "crear" | "migrar" | "catalogos";

export function preparacionAutorizada(env: NodeJS.ProcessEnv): boolean {
  return env[AUTORIZACION_PREPARACION] === "1" || env[AUTORIZACION_PREPARACION_ANTERIOR] === "1";
}

export function reinicioSolicitado(env: NodeJS.ProcessEnv): boolean {
  return env[AUTORIZACION_REINICIO] === "1" || env[AUTORIZACION_REINICIO_ANTERIOR] === "1";
}

/** Una base ya creada solo recibe migraciones pendientes y catálogos ausentes. */
export function pasosPreparacion(baseYaExiste: boolean): PasoPreparacion[] {
  return baseYaExiste ? ["migrar", "catalogos"] : ["crear", "migrar", "catalogos"];
}

export function afirmarUrlDeMigracion(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("La URL de migración no es válida.");
  }
  const nombre = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const porParametro = parsed.searchParams.get("database") ?? parsed.searchParams.get("schema");
  if (parsed.pathname !== "/aluma_test" || nombre !== "aluma_test" || porParametro !== null) {
    throw new Error("La URL de migración no identifica aluma_test.");
  }
}

function sinComentariosSql(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** Rechaza SQL que pueda crear, modificar o borrar la base real aluma. */
export function riesgoSql(sql: string): string | null {
  const ejecutable = sinComentariosSql(sql);
  const sinBaseDePruebas = ejecutable.replace(/`?aluma_test`?/gi, "BASE_DE_PRUEBAS");
  if (/\baluma\b/i.test(sinBaseDePruebas)) return "menciona la base aluma";
  if (/\bON\s+\*\s*\.\s*\*/i.test(ejecutable)) return "concede privilegios globales";
  if (/\bDROP\s+(DATABASE|SCHEMA|TABLE)\b/i.test(ejecutable)) return "contiene DROP";
  if (/\bTRUNCATE\b/i.test(ejecutable)) return "contiene TRUNCATE";
  if (/\bDELETE\s+FROM\b/i.test(ejecutable)) return "contiene DELETE";
  if (/\bUPDATE\s+(?!RESTRICT\b|CURRENT_TIMESTAMP\b)/i.test(ejecutable)) return "contiene UPDATE";
  for (const creacion of ejecutable.matchAll(/\bCREATE\s+DATABASE\b[^;]*/gi)) {
    if (!creacion[0].includes("aluma_test")) return "CREATE DATABASE no nombra aluma_test";
  }
  return null;
}

export function afirmarSqlDePreparacion(archivos: { ruta: string; sql: string }[]): void {
  for (const archivo of archivos) {
    const motivo = riesgoSql(archivo.sql);
    if (motivo) throw new Error(`${archivo.ruta}: ${motivo}`);
  }
}
