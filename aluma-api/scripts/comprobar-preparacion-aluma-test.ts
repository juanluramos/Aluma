import "dotenv/config";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { exigirBaseDePruebas } from "../src/config/base-de-pruebas.ts";
import {
  afirmarSqlDePreparacion,
  afirmarUrlDeMigracion,
  preparacionAutorizada,
  reinicioSolicitado,
} from "../src/config/preparacion-aluma-test.ts";

function sqlDePreparacion(): { ruta: string; sql: string }[] {
  const migraciones = readdirSync("prisma/migrations")
    .filter((nombre) => nombre !== "migration_lock.toml")
    .map((nombre) => join("prisma/migrations", nombre, "migration.sql"));
  return [...migraciones, "scripts/aluma-test-catalogos.sql", "scripts/aluma-test-permisos.sql"]
    .map((ruta) => ({ ruta, sql: readFileSync(ruta, "utf8") }));
}

const modo = process.argv[2];
if (modo === "url") {
  afirmarUrlDeMigracion(process.env.DATABASE_URL ?? "");
} else if (modo === "escribir") {
  if (!preparacionAutorizada(process.env)) {
    console.error("No se crea ni se modifica ninguna base.");
    console.error("Cuando aluma_test esté autorizada: ALUMA_AUTORIZAR_ALUMA_TEST=1 sh scripts/preparar-aluma-test.sh");
    process.exit(1);
  }
  if (reinicioSolicitado(process.env)) {
    console.error("Este script no reinicializa aluma_test. No borra tablas ni datos.");
    console.error("Quita ALUMA_AUTORIZAR_REINICIO_ALUMA_TEST. Una segunda ejecución solo completa migraciones y catálogos ausentes.");
    process.exit(1);
  }
  const conexion = exigirBaseDePruebas(process.env);
  if (conexion.database !== "aluma_test") throw new Error("Destino rechazado");
  afirmarSqlDePreparacion(sqlDePreparacion());
  const destino = process.argv[3];
  const enlace = process.argv[4];
  if (!destino || !enlace) throw new Error("Faltan las rutas temporales de conexión.");
  writeFileSync(destino, `[client]\nprotocol=TCP\nhost=${conexion.host}\nport=${conexion.port}\nuser=${conexion.user}\npassword=${conexion.password}\n`);
  const usuario = encodeURIComponent(conexion.user);
  const clave = encodeURIComponent(conexion.password);
  writeFileSync(enlace, `mysql://${usuario}:${clave}@${conexion.host}:${conexion.port}/aluma_test`);
} else {
  throw new Error("Modo de comprobación no reconocido.");
}
