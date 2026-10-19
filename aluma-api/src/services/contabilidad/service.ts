import type { Prisma } from "../../generated/prisma/client.js";
import { listarCuotasContables, sumarCuotasContables } from "../../repositories/contabilidad/cuotas.js";
import { listarMovimientos } from "../../repositories/contabilidad/movimientos.js";
import { leerSumasContables } from "../../repositories/contabilidad/resumen.js";
import {
  incluirEnResumen,
  whereCuotas,
  whereMovimientos,
  whereTipo,
  type FiltroContable,
  type RangoFecha,
} from "./filtros.js";
import { combinarMovimientos, presentarCuota, presentarMovimiento } from "./presentacion.js";
import { resumirContabilidad } from "./resumen.js";

export async function getResumenContableService(consulta?: {
  filtro: FiltroContable;
  rango: RangoFecha | null;
}) {
  if (!consulta) {
    const [datos, cuotasCobradas] = await Promise.all([
      leerSumasContables(),
      sumarCuotasContables({}),
    ]);
    return resumirContabilidad({ ...datos, cuotasCobradas });
  }
  const partes = incluirEnResumen(consulta.filtro.tipo);
  const cuotas = whereCuotas(consulta.filtro);
  const [datos, cuotasCobradas] = await Promise.all([
    leerSumasContables({
      cobro: partes.cobro
        ? whereTipo("Cobro", consulta.filtro, consulta.rango) as Prisma.MovimientoContableWhereInput
        : null,
      devolucion: partes.devolucion
        ? whereTipo("Devolución", consulta.filtro, consulta.rango) as Prisma.MovimientoContableWhereInput
        : null,
    }),
    partes.cobro && cuotas ? sumarCuotasContables(cuotas as Prisma.CuotaWhereInput) : Promise.resolve("0.00"),
  ]);
  return resumirContabilidad({ ...datos, cuotasCobradas });
}

export async function listarMovimientosContables(filtro: FiltroContable, rango: RangoFecha | null) {
  const cuotas = whereCuotas(filtro);
  const [movimientos, filasCuota] = await Promise.all([
    listarMovimientos(
      whereMovimientos(filtro, rango) as Prisma.MovimientoContableWhereInput,
      filtro.orden,
    ),
    cuotas ? listarCuotasContables(cuotas as Prisma.CuotaWhereInput) : Promise.resolve([]),
  ]);
  return combinarMovimientos(
    movimientos.map(presentarMovimiento),
    filasCuota.map(presentarCuota),
    filtro.orden,
    filtro.pagina,
    filtro.limite,
  );
}
