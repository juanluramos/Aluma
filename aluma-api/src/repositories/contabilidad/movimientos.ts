import { prisma } from "../../config/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";

const lectura = {
  id_movimiento: true,
  fecha: true,
  concepto: true,
  importe: true,
  TipoMovimiento: { select: { nombre: true } },
  InscripcionActividad: {
    select: {
      Usuario: { select: { nombre: true, apellido1: true, apellido2: true } },
      Actividad: { select: { titulo: true } },
      MetodoPago: { select: { nombre: true } },
    },
  },
} satisfies Prisma.MovimientoContableSelect;

export async function listarMovimientos(
  where: Prisma.MovimientoContableWhereInput,
  orden: "asc" | "desc",
) {
  return prisma.movimientoContable.findMany({
    where,
    orderBy: [{ fecha: orden }, { id_movimiento: orden }],
    select: lectura,
  });
}
