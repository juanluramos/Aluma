import { prisma } from "../../config/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { CreateConfiguracionCuotaDto } from "../../dtos/configuracion-cuota/create-configuracion-cuota.dto.js";
import type { UpdateConfiguracionCuotaDto } from "../../dtos/configuracion-cuota/update-configuracion-cuota.dto.js";

const lecturaConfiguracion = {
  id_configuracion: true,
  anio: true,
  importe: true,
  createAt: true,
  updateAt: true,
} satisfies Prisma.ConfiguracionCuotaAnualSelect;

export type ConfiguracionCuotaLectura = Prisma.ConfiguracionCuotaAnualGetPayload<{ select: typeof lecturaConfiguracion }>;

export async function getAllConfiguracionesCuota() {
  return prisma.configuracionCuotaAnual.findMany({
    select: lecturaConfiguracion,
    orderBy: [{ anio: "desc" }, { id_configuracion: "desc" }],
  });
}

export async function getConfiguracionCuotaById(
  id: number,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return client.configuracionCuotaAnual.findUnique({
    where: { id_configuracion: id },
    select: lecturaConfiguracion,
  });
}

export async function findConfiguracionPorAnio(
  anio: number,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return client.configuracionCuotaAnual.findUnique({
    where: { anio },
    select: lecturaConfiguracion,
  });
}

export async function createConfiguracionCuota(
  data: CreateConfiguracionCuotaDto,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return client.configuracionCuotaAnual.create({
    data: {
      anio: data.anio,
      importe: data.importe,
    },
    select: lecturaConfiguracion,
  });
}

export async function updateConfiguracionCuota(
  id: number,
  data: UpdateConfiguracionCuotaDto,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return client.configuracionCuotaAnual.update({
    where: { id_configuracion: id },
    data: {
      ...(data.anio !== undefined && { anio: data.anio }),
      ...(data.importe !== undefined && { importe: data.importe }),
    },
    select: lecturaConfiguracion,
  });
}

export async function deleteConfiguracionCuota(
  id: number,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return client.configuracionCuotaAnual.delete({
    where: { id_configuracion: id },
    select: lecturaConfiguracion,
  });
}
