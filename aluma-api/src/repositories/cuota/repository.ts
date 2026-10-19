import { prisma } from "../../config/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { CreateCuotaDto } from "../../dtos/cuota/create-cuota.dto.js";
import type { UpdateCuotaDto } from "../../dtos/cuota/update-cuota.dto.js";
import { fechaDesdeCalendario } from "../../utils/fechaCalendario.js";

const lecturaCuota = {
  id_cuota: true,
  id_usuario: true,
  pagoAnio: true,
  fechaPago: true,
  importePagado: true,
  comentario: true,
  createAt: true,
  updateAt: true,
  Usuario: {
    select: {
      id_usuario: true,
      codUsuario: true,
      nombre: true,
      apellido1: true,
      apellido2: true,
    },
  },
} satisfies Prisma.CuotaSelect;

export type CuotaLectura = Prisma.CuotaGetPayload<{ select: typeof lecturaCuota }>;

export async function getAllCuotas() {
  return prisma.cuota.findMany({
    select: lecturaCuota,
    orderBy: [{ pagoAnio: "desc" }, { id_cuota: "desc" }],
  });
}

export async function getCuotaById(id: number, client: Prisma.TransactionClient | typeof prisma = prisma) {
  return client.cuota.findUnique({
    where: { id_cuota: id },
    select: lecturaCuota,
  });
}

export async function getCuotasByUsuario(idUsuario: number) {
  return prisma.cuota.findMany({
    where: { id_usuario: idUsuario },
    select: lecturaCuota,
    orderBy: [{ pagoAnio: "desc" }, { id_cuota: "desc" }],
  });
}

export async function findCuotaByUsuarioAnio(
  idUsuario: number,
  pagoAnio: number,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return client.cuota.findUnique({
    where: { id_usuario_pagoAnio: { id_usuario: idUsuario, pagoAnio } },
    select: { id_cuota: true },
  });
}

export async function getUsuarioDeCuota(
  idUsuario: number,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return client.usuario.findUnique({
    where: { id_usuario: idUsuario },
    select: { id_usuario: true },
  });
}

/**
 * Crea la cuota.
 * fechaPago solo se envía si llegó en la petición; si no, MariaDB aplica CURDATE().
 * importePagado lo aporta el servicio desde la configuración del año; el cliente no lo envía.
 */
export async function createCuota(
  data: CreateCuotaDto,
  importePagado: Prisma.Decimal,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return client.cuota.create({
    data: {
      id_usuario: data.id_usuario,
      pagoAnio: data.pagoAnio,
      importePagado,
      ...(data.fechaPago !== undefined && { fechaPago: fechaDesdeCalendario(data.fechaPago) }),
      ...(data.comentario !== undefined && { comentario: data.comentario }),
    },
    select: lecturaCuota,
  });
}

export async function updateCuota(
  id: number,
  data: UpdateCuotaDto,
  importePagado: Prisma.Decimal | undefined,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return client.cuota.update({
    where: { id_cuota: id },
    data: {
      ...(data.id_usuario !== undefined && { id_usuario: data.id_usuario }),
      ...(data.pagoAnio !== undefined && { pagoAnio: data.pagoAnio }),
      ...(importePagado !== undefined && { importePagado }),
      ...(data.fechaPago !== undefined && { fechaPago: fechaDesdeCalendario(data.fechaPago) }),
      ...(data.comentario !== undefined && { comentario: data.comentario }),
    },
    select: lecturaCuota,
  });
}

export async function contarCuotasDelAnio(
  pagoAnio: number,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return client.cuota.count({ where: { pagoAnio } });
}

/**
 * Escribe socio solo si el valor cambia.
 * Devuelve null cuando el usuario ya tenía ese valor.
 */
export async function guardarSocioPorCuota(
  idUsuario: number,
  socio: boolean,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const actual = await client.usuario.findUnique({
    where: { id_usuario: idUsuario },
    select: { socio: true },
  });
  if (!actual || actual.socio === socio) return null;
  await client.usuario.update({
    where: { id_usuario: idUsuario },
    data: { socio },
    select: { id_usuario: true },
  });
  return { anterior: actual.socio, nuevo: socio };
}

export async function deleteCuota(id: number, client: Prisma.TransactionClient | typeof prisma = prisma) {
  return client.cuota.delete({
    where: { id_cuota: id },
    select: lecturaCuota,
  });
}
