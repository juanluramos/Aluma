export class AislamientoDePruebaRechazado extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AislamientoDePruebaRechazado";
  }
}

const CATALOGOS = new Set([
  "EstadoActividad",
  "EstadoPago",
  "EstadoUsuario",
  "EstadoInscripcion",
  "EstadoSolicitud",
  "RolUsuario",
  "TipoDocumentoIdentificacion",
  "TipoMovimiento",
  "MetodoPago",
]);

const ESCRITURAS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

type Conjunto =
  | "usuario"
  | "cuenta"
  | "actividad"
  | "inscripcion"
  | "movimiento"
  | "cuota"
  | "configuracionCuota"
  | "auditoria"
  | "solicitud"
  | "sesion"
  | "requestId"
  | "refreshHash";

const propio: Record<Conjunto, Set<string>> = {
  usuario: new Set(),
  cuenta: new Set(),
  actividad: new Set(),
  inscripcion: new Set(),
  movimiento: new Set(),
  cuota: new Set(),
  configuracionCuota: new Set(),
  auditoria: new Set(),
  solicitud: new Set(),
  sesion: new Set(),
  requestId: new Set(),
  refreshHash: new Set(),
};

const ANCLAS: Record<string, { campo: string; conjunto: Conjunto }[]> = {
  Usuario: [{ campo: "id_usuario", conjunto: "usuario" }],
  CuentaAutenticacion: [
    { campo: "id_cuenta", conjunto: "cuenta" },
    { campo: "id_usuario", conjunto: "usuario" },
  ],
  Actividad: [{ campo: "id_actividad", conjunto: "actividad" }],
  InscripcionActividad: [
    { campo: "id_inscripcion", conjunto: "inscripcion" },
    { campo: "id_usuario", conjunto: "usuario" },
    { campo: "id_actividad", conjunto: "actividad" },
  ],
  MovimientoContable: [
    { campo: "id_movimiento", conjunto: "movimiento" },
    { campo: "id_inscripcion", conjunto: "inscripcion" },
  ],
  Cuota: [
    { campo: "id_cuota", conjunto: "cuota" },
    { campo: "id_usuario", conjunto: "usuario" },
  ],
  ConfiguracionCuotaAnual: [{ campo: "id_configuracion", conjunto: "configuracionCuota" }],
  Auditoria: [
    { campo: "id_auditoria", conjunto: "auditoria" },
    { campo: "requestId", conjunto: "requestId" },
  ],
  SolicitudAlta: [
    { campo: "id_solicitud", conjunto: "solicitud" },
    { campo: "id_usuario_creado", conjunto: "usuario" },
    { campo: "id_administrador_resolucion", conjunto: "usuario" },
  ],
  SesionAutenticacion: [
    { campo: "id", conjunto: "sesion" },
    { campo: "id_usuario", conjunto: "usuario" },
    { campo: "refreshHash", conjunto: "refreshHash" },
  ],
};

function clave(valor: unknown): string {
  if (typeof valor === "bigint" || typeof valor === "number" || typeof valor === "string") return String(valor);
  return "";
}

function anadir(conjunto: Conjunto, valor: unknown) {
  const id = clave(valor);
  if (id) propio[conjunto].add(id);
}

export function registrarFila(modelo: string, fila: unknown) {
  if (!fila || typeof fila !== "object") return;
  const row = fila as Record<string, unknown>;
  if (modelo === "Usuario") anadir("usuario", row.id_usuario);
  if (modelo === "CuentaAutenticacion") anadir("cuenta", row.id_cuenta);
  if (modelo === "Actividad") anadir("actividad", row.id_actividad);
  if (modelo === "InscripcionActividad") anadir("inscripcion", row.id_inscripcion);
  if (modelo === "MovimientoContable") anadir("movimiento", row.id_movimiento);
  if (modelo === "Cuota") anadir("cuota", row.id_cuota);
  if (modelo === "ConfiguracionCuotaAnual") anadir("configuracionCuota", row.id_configuracion);
  if (modelo === "Auditoria") {
    anadir("auditoria", row.id_auditoria);
    anadir("requestId", row.requestId);
  }
  if (modelo === "SolicitudAlta") anadir("solicitud", row.id_solicitud);
  if (modelo === "SesionAutenticacion") {
    anadir("sesion", row.id);
    anadir("refreshHash", row.refreshHash);
  }
}

function valorPermitido(valor: unknown, conjunto: Conjunto, filtrarRequestId: boolean): { vale: boolean; valor: unknown; vacio: boolean } {
  if (valor !== null && typeof valor === "object" && !Array.isArray(valor)) {
    const filtro = valor as Record<string, unknown>;
    if ("not" in filtro || "notIn" in filtro || "gt" in filtro || "gte" in filtro || "lt" in filtro || "lte" in filtro || "contains" in filtro) {
      return { vale: false, valor, vacio: false };
    }
    if (Array.isArray(filtro.in)) {
      const propios = filtro.in.filter((item) => propio[conjunto].has(clave(item)));
      if (filtrarRequestId) {
        return { vale: true, valor: { ...filtro, in: propios }, vacio: propios.length === 0 };
      }
      return { vale: filtro.in.every((item) => propio[conjunto].has(clave(item))), valor, vacio: filtro.in.length === 0 };
    }
    return { vale: false, valor, vacio: false };
  }
  const conocido = propio[conjunto].has(clave(valor));
  if (filtrarRequestId && !conocido) return { vale: true, valor, vacio: true };
  return { vale: conocido, valor, vacio: false };
}

function anclar(modelo: string, where: unknown): { vale: boolean; where: unknown; vacio: boolean } {
  if (!where || typeof where !== "object" || Array.isArray(where)) return { vale: false, where, vacio: false };
  const filtro = where as Record<string, unknown>;
  if (Array.isArray(filtro.OR)) {
    if (filtro.OR.length === 0) return { vale: false, where, vacio: false };
    const ramas = filtro.OR.map((rama) => anclar(modelo, rama));
    if (ramas.some((rama) => !rama.vale)) return { vale: false, where, vacio: false };
    if (ramas.every((rama) => rama.vacio)) return { vale: true, where, vacio: true };
    return { vale: true, where: { ...filtro, OR: ramas.map((rama) => rama.where) }, vacio: false };
  }
  if (Array.isArray(filtro.AND)) {
    const ramas = filtro.AND.map((rama) => anclar(modelo, rama));
    if (ramas.some((rama) => !rama.vale)) return { vale: false, where, vacio: false };
    return { vale: true, where: { ...filtro, AND: ramas.map((rama) => rama.where) }, vacio: ramas.every((rama) => rama.vacio) };
  }
  if ("NOT" in filtro) return { vale: false, where, vacio: false };
  const anclas = ANCLAS[modelo] ?? [];
  for (const ancla of anclas) {
    if (!(ancla.campo in filtro)) continue;
    const decision = valorPermitido(filtro[ancla.campo], ancla.conjunto, ancla.conjunto === "requestId");
    if (!decision.vale) return { vale: false, where, vacio: false };
    return {
      vale: true,
      vacio: decision.vacio,
      where: decision.valor === filtro[ancla.campo] ? where : { ...filtro, [ancla.campo]: decision.valor },
    };
  }
  return { vale: false, where, vacio: false };
}

export function decidirEscritura(modelo: string, operation: string, args: { where?: unknown } | undefined): { omitir: boolean; args: { where?: unknown } | undefined } {
  if (!ESCRITURAS.has(operation)) return { omitir: false, args };
  if (CATALOGOS.has(modelo)) {
    throw new AislamientoDePruebaRechazado(`El catálogo ${modelo} es permanente y de solo lectura.`);
  }
  if (!ANCLAS[modelo]) {
    throw new AislamientoDePruebaRechazado(`La prueba no puede escribir en ${modelo}.`);
  }
  if (operation === "createMany") {
    throw new AislamientoDePruebaRechazado("createMany no conserva los identificadores creados.");
  }
  if (operation === "create" || operation === "createManyAndReturn") return { omitir: false, args };
  const decision = anclar(modelo, args?.where);
  if (!decision.vale) {
    throw new AislamientoDePruebaRechazado(`La escritura en ${modelo} no está limitada a registros de esta prueba.`);
  }
  if (decision.vacio) return { omitir: true, args };
  return { omitir: false, args: { ...args, where: decision.where } };
}

export function afirmarLecturaSql(args: unknown) {
  const texto = args && typeof args === "object" && "strings" in args && Array.isArray((args as { strings: unknown }).strings)
    ? (args as { strings: string[] }).strings.join(" ")
    : String(args ?? "");
  const sinBloqueo = texto.replace(/\bFOR\s+UPDATE\b/gi, " ");
  if (!/^\s*(SELECT|WITH)\b/i.test(texto) || /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|REPLACE|GRANT|REVOKE)\b/i.test(sinBloqueo)) {
    throw new AislamientoDePruebaRechazado("La prueba solo puede ejecutar lecturas SQL.");
  }
}

function ids(conjunto: Conjunto, convertir: (valor: string) => unknown) {
  return [...propio[conjunto]].map(convertir);
}

async function borrar(db: Record<string, { deleteMany: (args: unknown) => Promise<unknown> }>, modelo: string, campo: string, valores: unknown[]) {
  if (valores.length === 0) return;
  await db[modelo]!.deleteMany({ where: { [campo]: { in: valores } } });
}

type ClienteLimpieza = Record<string, { deleteMany: (args: unknown) => Promise<unknown> }> & {
  $transaction: (operacion: (tx: ClienteLimpieza) => Promise<void>) => Promise<void>;
};

export function reiniciarRegistroDePrueba() {
  for (const conjunto of Object.values(propio)) conjunto.clear();
}

export async function limpiarPropiedadDePrueba(db: ClienteLimpieza) {
  const numero = (valor: string) => Number(valor);
  await db.$transaction(async (tx) => {
    await borrar(tx, "auditoria", "id_auditoria", ids("auditoria", (valor) => BigInt(valor)));
    await borrar(tx, "movimientoContable", "id_movimiento", ids("movimiento", numero));
    await borrar(tx, "movimientoContable", "id_inscripcion", ids("inscripcion", numero));
    await borrar(tx, "inscripcionActividad", "id_inscripcion", ids("inscripcion", numero));
    await borrar(tx, "inscripcionActividad", "id_actividad", ids("actividad", numero));
    await borrar(tx, "inscripcionActividad", "id_usuario", ids("usuario", numero));
    await borrar(tx, "sesionAutenticacion", "id", ids("sesion", (valor) => valor));
    await borrar(tx, "sesionAutenticacion", "id_usuario", ids("usuario", numero));
    await borrar(tx, "cuentaAutenticacion", "id_cuenta", ids("cuenta", numero));
    await borrar(tx, "cuentaAutenticacion", "id_usuario", ids("usuario", numero));
    await borrar(tx, "solicitudAlta", "id_solicitud", ids("solicitud", numero));
    await borrar(tx, "solicitudAlta", "id_usuario_creado", ids("usuario", numero));
    await borrar(tx, "solicitudAlta", "id_administrador_resolucion", ids("usuario", numero));
    await borrar(tx, "actividad", "id_actividad", ids("actividad", numero));
    await borrar(tx, "cuota", "id_cuota", ids("cuota", numero));
    await borrar(tx, "cuota", "id_usuario", ids("usuario", numero));
    await borrar(tx, "configuracionCuotaAnual", "id_configuracion", ids("configuracionCuota", numero));
    await borrar(tx, "usuario", "id_usuario", ids("usuario", numero));
  });
  reiniciarRegistroDePrueba();
}

export function extensionAislamiento() {
  return {
    name: "aislamiento-pruebas",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: {
          model: string;
          operation: string;
          args: { where?: unknown; data?: unknown };
          query: (args: unknown) => Promise<unknown>;
        }) {
          const decision = decidirEscritura(model, operation, args);
          if (decision.omitir) return operation === "delete" || operation === "update" || operation === "upsert" ? null : { count: 0 };
          const resultado = await query(decision.args);
          if (operation === "create" || operation === "upsert" || operation === "update") registrarFila(model, resultado);
          if (operation === "createManyAndReturn" && Array.isArray(resultado)) {
            for (const fila of resultado) registrarFila(model, fila);
          }
          return resultado;
        },
      },
      async $queryRaw({ args, query }: { args: unknown; query: (args: unknown) => Promise<unknown> }) {
        afirmarLecturaSql(args);
        return query(args);
      },
      async $executeRaw() {
        throw new AislamientoDePruebaRechazado("La prueba no puede ejecutar SQL de escritura.");
      },
      async $queryRawUnsafe() {
        throw new AislamientoDePruebaRechazado("La prueba no puede ejecutar SQL sin parámetros.");
      },
      async $executeRawUnsafe() {
        throw new AislamientoDePruebaRechazado("La prueba no puede ejecutar SQL de escritura.");
      },
    },
  };
}
