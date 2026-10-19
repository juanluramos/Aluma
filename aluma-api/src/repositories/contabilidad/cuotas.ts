import { prisma } from "../../config/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";

const lectura = {
  id_cuota: true,
  pagoAnio: true,
  fechaPago: true,
  importePagado: true,
  Usuario: { select: { nombre: true, apellido1: true, apellido2: true } },
} satisfies Prisma.CuotaSelect;

export async function listarCuotasContables(where: Prisma.CuotaWhereInput) {
  return prisma.cuota.findMany({ where, select: lectura });
}

export async function sumarCuotasContables(where: Prisma.CuotaWhereInput) {
  const agregado = await prisma.cuota.aggregate({ where, _sum: { importePagado: true } });
  return agregado._sum.importePagado?.toFixed(2) ?? "0.00";
}
