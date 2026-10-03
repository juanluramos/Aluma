import { prisma } from "../../config/prisma.js";
import type { CreateAccountingMovementDto } from "../../dtos/movimiento-contable/create-accounting-movement.dto.js";
import type { UpdateAccountingMovementDto } from "../../dtos/movimiento-contable/update-accounting-movement.dto.js";
import type { Prisma } from "../../generated/prisma/client.js";

/**
 * Obtiene todos los movimientos contables.
 */
export async function getAllAccountingMovements() {
  return prisma.movimientoContable.findMany();
}

/**
 * Obtiene un movimiento contable por su ID.
 *
 * @param id - ID del movimiento.
 */
export async function getAccountingMovementById(id: number, client: Prisma.TransactionClient = prisma) {
  return client.movimientoContable.findUnique({
    where: {
      id_movimiento: id,
    },
  });
}

/**
 * Obtiene un tipo de movimiento por su ID.
 *
 * Nos servirá después en el Service para aplicar
 * las reglas de signo según Cobro, Devolución o Ajuste.
 *
 * @param id - ID del tipo de movimiento.
 */
export async function getMovementTypeById(id: number, client: Prisma.TransactionClient = prisma) {
  return client.tipoMovimiento.findUnique({
    where: {
      id_tipo_movimiento: id,
    },
  });
}

/**
 * Crea un movimiento contable.
 *
 * @param data - Datos validados del movimiento.
 */
export async function createAccountingMovement(
  data: CreateAccountingMovementDto,
  client: Prisma.TransactionClient = prisma
) {
  return client.movimientoContable.create({
    data: {
      id_tipo_movimiento: data.id_tipo_movimiento,
      concepto: data.concepto,
      importe: data.importe,
      fecha: data.fecha,

      ...(data.id_inscripcion !== undefined && {
        id_inscripcion: data.id_inscripcion,
      }),

      ...(data.comentario !== undefined && {
        comentario: data.comentario,
      }),
    },
  });
}

/**
 * Actualiza un movimiento contable.
 *
 * @param id - ID del movimiento.
 * @param data - Campos que se desean modificar.
 */
export async function updateAccountingMovement(
  id: number,
  data: UpdateAccountingMovementDto,
  client: Prisma.TransactionClient = prisma
) {
  return client.movimientoContable.update({
    where: {
      id_movimiento: id,
      id_inscripcion: null,
    },

    data: {
      ...(data.id_tipo_movimiento !== undefined && {
        id_tipo_movimiento: data.id_tipo_movimiento,
      }),

      ...(data.concepto !== undefined && {
        concepto: data.concepto,
      }),

      ...(data.importe !== undefined && {
        importe: data.importe,
      }),

      ...(data.fecha !== undefined && {
        fecha: data.fecha,
      }),

      ...(data.id_inscripcion !== undefined && {
        id_inscripcion: data.id_inscripcion,
      }),

      ...(data.comentario !== undefined && {
        comentario: data.comentario,
      }),
    },
  });
}

/**
 * Elimina un movimiento contable.
 *
 * @param id - ID del movimiento.
 */
export async function deleteAccountingMovement(id: number, client: Prisma.TransactionClient = prisma) {
  return client.movimientoContable.delete({
    where: {
      id_movimiento: id,
      id_inscripcion: null,
    },
  });
}

/**
 * Busca una devolución ya registrada para una inscripción.
 *
 * @param enrollmentId - ID de la inscripción.
 * @returns La devolución encontrada o null.
 */
export async function getRefundByEnrollmentId(
  enrollmentId: number
) {
  return prisma.movimientoContable.findFirst({
    where: {
      id_inscripcion: enrollmentId,

      TipoMovimiento: {
        nombre: "Devolución",
      },
    },
  });
}

/**
 * Busca si ya existe un cobro asociado
 * a una inscripción concreta.
 *
 * @param enrollmentId - ID de la inscripción.
 * @returns El cobro encontrado o null.
 */
export async function getChargeByEnrollmentId(
  enrollmentId: number
) {
  return prisma.movimientoContable.findFirst({
    where: {
      id_inscripcion: enrollmentId,
      TipoMovimiento: {
        nombre: "Cobro",
      },
    },
  });
}
