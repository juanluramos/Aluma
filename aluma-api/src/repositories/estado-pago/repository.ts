import { prisma } from "../../config/prisma.js";

export async function getAllPaymentStatuses() {
  return prisma.estadoPago.findMany({
    select: {
      id_estado_pago: true,
      nombre_estado: true,
    },
    orderBy: { id_estado_pago: "asc" },
  });
}
