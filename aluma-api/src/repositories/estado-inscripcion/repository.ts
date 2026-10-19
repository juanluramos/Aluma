import { prisma } from "../../config/prisma.js";

export async function getAllEnrollmentStatuses() {
  return prisma.estadoInscripcion.findMany({
    select: {
      id_estado_inscripcion: true,
      nombre: true,
    },
    orderBy: { id_estado_inscripcion: "asc" },
  });
}
