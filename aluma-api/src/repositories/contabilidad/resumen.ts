import { prisma } from "../../config/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { filtroPendienteCobro } from "../../services/contabilidad/resumen.js";

type FiltroSumas = {
  cobro: Prisma.MovimientoContableWhereInput | null;
  devolucion: Prisma.MovimientoContableWhereInput | null;
};

export async function leerSumasContables(filtros?: FiltroSumas) {
  const [pendiente, sumasPorTipo] = await Promise.all([
    leerPendienteCobro(),
    filtros ? sumasFiltradas(filtros) : sumasSinFiltro(),
  ]);
  return { sumasPorTipo, pendiente };
}

async function sumasFiltradas(filtros: FiltroSumas) {
  const [cobro, devolucion] = await Promise.all([
    filtros.cobro ? suma(filtros.cobro) : "0.00",
    filtros.devolucion ? suma(filtros.devolucion) : "0.00",
  ]);
  return { Cobro: cobro, "Devolución": devolucion };
}

async function sumasSinFiltro() {
  const tipos = await prisma.tipoMovimiento.findMany({
    where: { nombre: { in: ["Cobro", "Devolución"] } },
    select: { id_tipo_movimiento: true, nombre: true },
  });
  const ids = tipos.map((tipo) => tipo.id_tipo_movimiento);
  const sumas = ids.length === 0
    ? []
    : await prisma.movimientoContable.groupBy({
      by: ["id_tipo_movimiento"],
      where: { id_tipo_movimiento: { in: ids } },
      _sum: { importe: true },
    });
  const sumasPorTipo: Record<string, string> = {};
  for (const tipo of tipos) {
    const fila = sumas.find((suma) => suma.id_tipo_movimiento === tipo.id_tipo_movimiento);
    sumasPorTipo[tipo.nombre] = fila?._sum.importe?.toFixed(2) ?? "0.00";
  }
  return sumasPorTipo;
}

async function leerPendienteCobro() {
  const [activa, pendiente] = await Promise.all([
    prisma.estadoInscripcion.findUnique({
      where: { nombre: "Activa" },
      select: { id_estado_inscripcion: true },
    }),
    prisma.estadoPago.findUnique({
      where: { nombre_estado: "Pendiente" },
      select: { id_estado_pago: true },
    }),
  ]);
  const filtro = filtroPendienteCobro(
    activa?.id_estado_inscripcion ?? null,
    pendiente?.id_estado_pago ?? null,
  );
  if (!filtro) return "0.00";
  const agregado = await prisma.inscripcionActividad.aggregate({
    where: filtro,
    _sum: { precioAplicado: true },
  });
  return agregado._sum.precioAplicado?.toFixed(2) ?? "0.00";
}

function suma(where: Prisma.MovimientoContableWhereInput) {
  return prisma.movimientoContable.aggregate({ where, _sum: { importe: true } })
    .then((agregado) => agregado._sum.importe?.toFixed(2) ?? "0.00");
}
