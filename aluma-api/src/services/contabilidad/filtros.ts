import { fechaDesdeCalendario } from "../../utils/fechaCalendario.js";

export const TIPOS_MOVIMIENTO = ["Cobro", "Devolución", "Ajuste"] as const;

export type TipoMovimientoNombre = (typeof TIPOS_MOVIMIENTO)[number];

export type FiltroContable = {
  desde: string | null;
  hasta: string | null;
  tipo: TipoMovimientoNombre | null;
  q: string | null;
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
  const claves = ["desde", "hasta", "tipo", "q", "pagina", "orden", "limite"];
  const vacia = claves.every((clave) => texto(query[clave]) === "");
  if (vacia) return { vacia: true };

  const desde = texto(query.desde);
  const hasta = texto(query.hasta);
  const tipoTexto = texto(query.tipo);
  const q = texto(query.q);
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
  return {
    ...(rango ? { fecha: rango } : {}),
    ...(filtro.tipo ? { TipoMovimiento: { nombre: filtro.tipo } } : {}),
    ...(filtro.q ? { OR: busqueda(filtro.q) } : {}),
  };
}

export function whereTipo(nombre: "Cobro" | "Devolución", filtro: FiltroContable, rango: RangoFecha | null) {
  return {
    TipoMovimiento: { nombre },
    ...(rango ? { fecha: rango } : {}),
    ...(filtro.q ? { OR: busqueda(filtro.q) } : {}),
  };
}

function busqueda(q: string) {
  return [
    { concepto: { contains: q } },
    { InscripcionActividad: { Usuario: { nombre: { contains: q } } } },
    { InscripcionActividad: { Usuario: { apellido1: { contains: q } } } },
    { InscripcionActividad: { Usuario: { apellido2: { contains: q } } } },
    { InscripcionActividad: { Actividad: { titulo: { contains: q } } } },
  ];
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
  const fechaPago = rangoFechaPago(filtro.desde, filtro.hasta);
  const where: {
    fechaPago?: { gte?: Date; lt?: Date };
    OR?: Array<Record<string, unknown>>;
  } = {};
  if (fechaPago) where.fechaPago = fechaPago;
  if (!filtro.q) return where;

  const concepto = aniosConceptoCuota(filtro.q);
  if (concepto === "todas") return where;
  const nombres = [
    { Usuario: { nombre: { contains: filtro.q } } },
    { Usuario: { apellido1: { contains: filtro.q } } },
    { Usuario: { apellido2: { contains: filtro.q } } },
  ];
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
