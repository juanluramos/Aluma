import { textoFechaCalendario } from "../../utils/fechaCalendario.js";

export type MovimientoLista = {
  id: number;
  fecha: string;
  tipo: string;
  concepto: string;
  usuario: string | null;
  actividad: string | null;
  metodoPago: string | null;
  importe: string;
};

type Fila = {
  id_movimiento: number;
  fecha: Date;
  concepto: string;
  importe: { toFixed: (decimales: number) => string };
  TipoMovimiento: { nombre: string };
  InscripcionActividad: {
    Usuario: { nombre: string; apellido1: string | null; apellido2: string | null } | null;
    Actividad: { titulo: string } | null;
    MetodoPago: { nombre: string } | null;
  } | null;
};

type FilaCuota = {
  id_cuota: number;
  pagoAnio: number;
  fechaPago: Date;
  importePagado: { toFixed: (decimales: number) => string };
  Usuario: { nombre: string; apellido1: string | null; apellido2: string | null };
};

export function presentarMovimiento(fila: Fila): MovimientoLista {
  const usuario = fila.InscripcionActividad?.Usuario;
  const nombre = usuario
    ? [usuario.nombre, usuario.apellido1, usuario.apellido2].filter(Boolean).join(" ")
    : "";
  return {
    id: fila.id_movimiento,
    fecha: diaLocal(fila.fecha),
    tipo: fila.TipoMovimiento.nombre,
    concepto: fila.concepto,
    usuario: nombre || null,
    actividad: fila.InscripcionActividad?.Actividad?.titulo.trim() || null,
    metodoPago: fila.InscripcionActividad?.MetodoPago?.nombre ?? null,
    importe: fila.importe.toFixed(2),
  };
}

export function presentarCuota(fila: FilaCuota): MovimientoLista {
  const nombre = [fila.Usuario.nombre, fila.Usuario.apellido1, fila.Usuario.apellido2].filter(Boolean).join(" ");
  return {
    id: -fila.id_cuota,
    fecha: textoFechaCalendario(fila.fechaPago),
    tipo: "Cobro",
    concepto: `Cuota ${fila.pagoAnio}`,
    usuario: nombre || null,
    actividad: null,
    metodoPago: null,
    importe: fila.importePagado.toFixed(2),
  };
}

export function diaLocal(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

export function combinarMovimientos(
  movimientos: readonly MovimientoLista[],
  cuotas: readonly MovimientoLista[],
  orden: "asc" | "desc",
  pagina: number,
  limite: number,
) {
  const factor = orden === "asc" ? 1 : -1;
  const filas = [...movimientos, ...cuotas].sort((a, b) => {
    const fecha = a.fecha.localeCompare(b.fecha);
    return (fecha || a.id - b.id) * factor;
  });
  const total = filas.length;
  const inicio = (pagina - 1) * limite;
  return {
    movimientos: filas.slice(inicio, inicio + limite),
    total,
    pagina,
    totalPaginas: total === 0 ? 0 : Math.ceil(total / limite),
  };
}
