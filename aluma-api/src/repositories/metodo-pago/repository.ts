import { prisma } from "../../config/prisma.js";

export async function getAllPaymentMethods() {
  return prisma.metodoPago.findMany({
    select: {
      id_metodo_pago: true,
      nombre: true,
    },
    orderBy: { id_metodo_pago: "asc" },
  });
}
