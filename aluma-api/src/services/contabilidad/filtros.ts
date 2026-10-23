import { fechaDesdeCalendario } from "../../utils/fechaCalendario.js";

export const TIPOS_MOVIMIENTO = ["Cobro", "Devolución", "Ajuste"] as const;

export type TipoMovimientoNombre = (typeof TIPOS_MOVIMIENTO)[number];

export type SeleccionActividad = {
  ids: number[];
  sinActividad: boolean;
};

export type FiltroContable = {
  desde: string | null;
  hasta: string | null;
  tipo: TipoMovimientoNombre | null;
  q: string | null;
  actividad: SeleccionActividad | null;
  pagina: number;
  limite: number;
  orden: "asc" | "desc";
};

export type RangoFecha = { gte?: Date; lt?: Date };

const LIMITE = 23;

export function interpretarConsulta(query: Record<string, unknown>):
  | { error: string }
  | { vacia: true }
  | { filtro: FiltroContable; rango: RangoFecha | null } {
  const claves = ["desde", "hasta", "tipo", "q", "actividad", "pagina", "orden", "limite"];
  const vacia = claves.every((clave) => texto(query[clave]) === "");
  if (vacia) return { vacia: true };

  const desde = texto(query.desde);
  const hasta = texto(query.hasta);
  const tipoTexto = texto(query.tipo);
  const q = texto(query.q);
  const actividadLeida = leerActividad(texto(query.actividad));
  if ("error" in actividadLeida) return actividadLeida;
  const ordenTexto = texto(query.orden) || "desc";
  const paginaTexto = texto(query.pagina) || "1";
  const limiteTexto = texto(query.limite) || String(LIMITE);
  if (desde && !diaValido(desde)) return { error: "La fecha inicial no es válida." };
  if (hasta && !diaValido(hasta)) return { error: "La fecha final no es válida." };
  if (desde && hasta && desde > hasta) return { error: "La fecha inicial no puede ser posterior a la final." };
  if (ordenTexto !== "asc" && ordenTexto !== "desc") return { error: "Orden no válida." };
  const pagina = Number(paginaTexto);
  const limite = Number(limiteTexto);
  if (!Number.isInteger(pagina) || pagina < 1) return { error: "Página no válida." };
  if (!Number.isInteger(limite) || limite < 1 || limite > 100) return { error: "Límite no válido." };
  let tipo: TipoMovimientoNombre | null = null;
  if (tipoTexto && tipoTexto !== "Todos") {
    if (!esTipo(tipoTexto)) return { error: "Tipo de movimiento no válido." };
    tipo = tipoTexto;
  }

  return {
    filtro: {
      desde: desde || null,
      hasta: hasta || null,
      tipo,
      q: q || null,
      actividad: actividadLeida.actividad,
      pagina,
      limite,
      orden: ordenTexto,
    },
    rango: rangoLocal(desde, hasta),
  };
}

export function rangoLocal(desde: string, hasta: string): RangoFecha | null {
  const rango: RangoFecha = {};
  if (desde) rango.gte = fechaLocal(desde);
  if (hasta) rango.lt = diaSiguiente(fechaLocal(hasta));
  return rango.gte || rango.lt ? rango : null;
}

export function incluirEnResumen(tipo: TipoMovimientoNombre | null) {
  if (tipo === "Ajuste") return { cobro: false, devolucion: false };
  if (tipo === "Cobro") return { cobro: true, devolucion: false };
  if (tipo === "Devolución") return { cobro: false, devolucion: true };
  return { cobro: true, devolucion: true };
}

export function whereMovimientos(filtro: FiltroContable, rango: RangoFecha | null) {
  return conActividad({
    ...(rango ? { fecha: rango } : {}),
    ...(filtro.tipo ? { TipoMovimiento: { nombre: filtro.tipo } } : {}),
    ...(filtro.q ? { OR: busqueda(filtro.q) } : {}),
  }, filtro.actividad);
}

export function whereTipo(nombre: "Cobro" | "Devolución", filtro: FiltroContable, rango: RangoFecha | null) {
  return conActividad({
    TipoMovimiento: { nombre },
    ...(rango ? { fecha: rango } : {}),
    ...(filtro.q ? { OR: busqueda(filtro.q) } : {}),
  }, filtro.actividad);
}

function palabras(q: string): string[] {
  return q.split(/\s+/).filter((parte) => parte !== "");
}

/** Cada palabra tiene que aparecer en el mismo texto, aunque esté en otro campo del nombre. */
function busqueda(q: string) {
  const partes = palabras(q);
  const usuario = {
    AND: partes.map((parte) => ({
      OR: [
        { nombre: { contains: parte } },
        { apellido1: { contains: parte } },
        { apellido2: { contains: parte } },
      ],
    })),
  };
  return [
    partes.length === 1
      ? { concepto: { contains: q } }
      : { AND: partes.map((parte) => ({ concepto: { contains: parte } })) },
    { InscripcionActividad: { Usuario: usuario } },
    partes.length === 1
      ? { InscripcionActividad: { Actividad: { titulo: { contains: q } } } }
      : { InscripcionActividad: { Actividad: { AND: partes.map((parte) => ({ titulo: { contains: parte } })) } } },
  ];
}

function conActividad(
  where: Record<string, unknown>,
  actividad: SeleccionActividad | null,
): Record<string, unknown> {
  if (!actividad) return where;
  return { AND: [where, restriccionActividad(actividad)] };
}

function restriccionActividad(actividad: SeleccionActividad): Record<string, unknown> {
  const opciones: Record<string, unknown>[] = [];
  if (actividad.ids.length > 0) {
    opciones.push({ InscripcionActividad: { id_actividad: { in: actividad.ids } } });
  }
  if (actividad.sinActividad) opciones.push({ id_inscripcion: null });
  if (opciones.length === 0) return { id_movimiento: { in: [] } };
  if (opciones.length === 1) return opciones[0]!;
  return { OR: opciones };
}

function leerActividad(valor: string): { error: string } | { actividad: SeleccionActividad | null } {
  if (!valor) return { actividad: null };
  if (valor === "ninguna") return { actividad: { ids: [], sinActividad: false } };
  const ids: number[] = [];
  let sinActividad = false;
  for (const parte of valor.split(",")) {
    const token = parte.trim();
    if (!token) continue;
    if (token === "sin") {
      sinActividad = true;
      continue;
    }
    if (!/^[1-9]\d*$/.test(token)) return { error: "Actividad no válida." };
    const id = Number(token);
    if (!Number.isSafeInteger(id)) return { error: "Actividad no válida." };
    ids.push(id);
  }
  if (ids.length === 0 && !sinActividad) return { error: "Actividad no válida." };
  return { actividad: { ids, sinActividad } };
}

function fechaLocal(dia: string): Date {
  const partes = dia.split("-").map(Number);
  return new Date(partes[0] ?? 0, (partes[1] ?? 1) - 1, partes[2] ?? 1);
}

function diaSiguiente(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + 1);
}

function diaValido(dia: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const fecha = fechaLocal(dia);
  const partes = dia.split("-").map(Number);
  const anio = partes[0];
  const mes = partes[1];
  const numero = partes[2];
  if (anio === undefined || mes === undefined || numero === undefined) return false;
  return fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === numero;
}

function esTipo(valor: string): valor is TipoMovimientoNombre {
  return (TIPOS_MOVIMIENTO as readonly string[]).includes(valor);
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

const ANIO_CUOTA_MINIMO = 1970;
const ANIO_CUOTA_MAXIMO = 2100;

export function aniosConceptoCuota(q: string): number[] | "todas" | "ninguno" {
  const normal = q.trim().toLocaleLowerCase("es");
  if (!normal) return "todas";
  const anios: number[] = [];
  for (let anio = ANIO_CUOTA_MINIMO; anio <= ANIO_CUOTA_MAXIMO; anio += 1) {
    if (`cuota ${anio}`.includes(normal)) anios.push(anio);
  }
  if (anios.length === 0) return "ninguno";
  if (anios.length === ANIO_CUOTA_MAXIMO - ANIO_CUOTA_MINIMO + 1) return "todas";
  return anios;
}

export function whereCuotas(filtro: FiltroContable) {
  if (filtro.tipo && filtro.tipo !== "Cobro") return null;
  if (filtro.actividad && !filtro.actividad.sinActividad) return null;
  const fechaPago = rangoFechaPago(filtro.desde, filtro.hasta);
  const where: {
    fechaPago?: { gte?: Date; lt?: Date };
    OR?: Array<Record<string, unknown>>;
  } = {};
  if (fechaPago) where.fechaPago = fechaPago;
  if (!filtro.q) return where;

  const concepto = aniosConceptoCuota(filtro.q);
  if (concepto === "todas") return where;
  const partes = palabras(filtro.q);
  const nombres = [{
    Usuario: {
      AND: partes.map((parte) => ({
        OR: [
          { nombre: { contains: parte } },
          { apellido1: { contains: parte } },
          { apellido2: { contains: parte } },
        ],
      })),
    },
  }];
  where.OR = concepto === "ninguno" ? nombres : [...nombres, { pagoAnio: { in: concepto } }];
  return where;
}

function rangoFechaPago(desde: string | null, hasta: string | null) {
  if (!desde && !hasta) return null;
  const fechaPago: { gte?: Date; lt?: Date } = {};
  if (desde) fechaPago.gte = fechaDesdeCalendario(desde);
  if (hasta) {
    const fin = fechaDesdeCalendario(hasta);
    fechaPago.lt = new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth(), fin.getUTCDate() + 1));
  }
  return fechaPago;
}
