import { prisma } from '../../config/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../errors/app-error.js';
import type { CreateEnrollmentDto } from '../../dtos/inscripcion-actividad/create-enrollment.dto.js';
import type { UpdateEnrollmentDto } from '../../dtos/inscripcion-actividad/update-enrollment.dto.js';

export type EnrollmentTransaction = Prisma.TransactionClient;
export type EnrollmentMovement = {
  id_tipo_movimiento: number;
  concepto: string;
  importe: number;
  fecha: Date;
};

// Las lecturas de negocio y las escrituras comparten aislamiento y reintento.
export async function withEnrollmentTransaction<T>(
  operation: (tx: EnrollmentTransaction) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') {
        throw error;
      }
    }
  }
  throw new AppError('Conflicto concurrente; vuelve a intentar la operación', 409, 'CONCURRENT_ENROLLMENT_UPDATE');
}

const lecturaInscripcion = {
  id_inscripcion: true,
  id_usuario: true,
  id_actividad: true,
  precioAplicado: true,
  id_estado_pago: true,
  id_estado_inscripcion: true,
  id_metodo_pago: true,
  apuntadoFecha: true,
  fechaPago: true,
  comentario: true,
  createAt: true,
  updateAt: true,
  Usuario: {
    select: {
      id_usuario: true,
      nombre: true,
      apellido1: true,
      apellido2: true,
    },
  },
  Actividad: {
    select: {
      id_actividad: true,
      titulo: true,
    },
  },
} satisfies Prisma.InscripcionActividadSelect;

export async function getAllEnrollments(userId?: number) {
  return prisma.inscripcionActividad.findMany({
    where: userId === undefined ? {} : { id_usuario: userId },
    select: lecturaInscripcion,
  });
}

export async function getEnrollmentById(id: number, db: EnrollmentTransaction = prisma) {
  return db.inscripcionActividad.findUnique({
    where: { id_inscripcion: id },
    select: lecturaInscripcion,
  });
}

export async function getEnrollmentWithMovements(id: number, db: EnrollmentTransaction) {
  return db.inscripcionActividad.findUnique({
    where: { id_inscripcion: id },
    include: { MovimientoContable: { include: { TipoMovimiento: true } } },
  });
}

export async function createEnrollment(
  data: CreateEnrollmentDto,
  enrollmentStatusId: number,
  paymentStatusId: number,
  precioAplicado: Prisma.Decimal,
  db: EnrollmentTransaction,
) {
  return db.inscripcionActividad.create({
    data: {
      id_usuario: data.id_usuario,
      id_actividad: data.id_actividad,
      precioAplicado,
      id_estado_pago: paymentStatusId,
      id_estado_inscripcion: enrollmentStatusId,
      apuntadoFecha: data.apuntadoFecha,
      ...(data.comentario !== undefined ? { comentario: data.comentario } : {}),
    },
    select: lecturaInscripcion,
  });
}

export async function updateEnrollment(id: number, data: UpdateEnrollmentDto, db: EnrollmentTransaction) {
  return db.inscripcionActividad.update({ where: { id_inscripcion: id }, data: enrollmentFields(data) });
}

export async function promoteEnrollmentStatus(id: number, enrollmentStatusId: number, db: EnrollmentTransaction) {
  return db.inscripcionActividad.update({
    where: { id_inscripcion: id },
    data: { id_estado_inscripcion: enrollmentStatusId },
    select: lecturaInscripcion,
  });
}

function enrollmentFields(data: UpdateEnrollmentDto) {
  // precioAplicado no se copia: el PUT no puede sustituir el importe guardado.
  // createAt y updateAt tampoco: el cliente no puede cambiar el orden de la cola.
  return {
    ...(data.id_usuario !== undefined && { id_usuario: data.id_usuario }),
    ...(data.id_actividad !== undefined && { id_actividad: data.id_actividad }),
    ...(data.id_estado_pago !== undefined && { id_estado_pago: data.id_estado_pago }),
    ...(data.id_estado_inscripcion !== undefined && { id_estado_inscripcion: data.id_estado_inscripcion }),
    ...(data.id_metodo_pago !== undefined && { id_metodo_pago: data.id_metodo_pago }),
    ...(data.apuntadoFecha !== undefined && { apuntadoFecha: data.apuntadoFecha }),
    ...(data.fechaPago !== undefined && { fechaPago: data.fechaPago }),
    ...(data.comentario !== undefined && { comentario: data.comentario }),
  };
}

export async function createEnrollmentMovement(id: number, movement: EnrollmentMovement, db: EnrollmentTransaction) {
  return db.movimientoContable.create({ data: { ...movement, id_inscripcion: id } });
}

export async function updateEnrollmentWithMovement(
  id: number,
  data: UpdateEnrollmentDto,
  movement: EnrollmentMovement,
  db: EnrollmentTransaction,
) {
  // Reutilizar la escritura evita omitir id_estado_inscripcion al cerrar.
  const enrollment = await updateEnrollment(id, data, db);
  await createEnrollmentMovement(id, movement, db);
  return enrollment;
}

export async function deleteEnrollment(id: number, db: EnrollmentTransaction) {
  return db.inscripcionActividad.delete({ where: { id_inscripcion: id } });
}

export async function getPaymentStatusById(id: number, db: EnrollmentTransaction) {
  return db.estadoPago.findUnique({
    where: { id_estado_pago: id }, include: { TipoMovimiento: true },
  });
}

export async function getPaymentStatusByName(name: string, db: EnrollmentTransaction) {
  return db.estadoPago.findUnique({ where: { nombre_estado: name } });
}

export async function getUserEnrollmentsForPricing(userId: number, db: EnrollmentTransaction) {
  return db.inscripcionActividad.findMany({
    where: { id_usuario: userId },
    select: {
      id_inscripcion: true,
      precioAplicado: true,
      EstadoPago: { select: { nombre_estado: true } },
      EstadoInscripcion: { select: { nombre: true } },
      Actividad: { select: { importeSocio: true, importeNoSocio: true } },
    },
  });
}

export async function getActivityEnrollmentsForPricing(activityId: number, db: EnrollmentTransaction) {
  return db.inscripcionActividad.findMany({
    where: { id_actividad: activityId },
    select: {
      id_inscripcion: true,
      precioAplicado: true,
      Usuario: { select: { socio: true } },
      EstadoPago: { select: { nombre_estado: true } },
      EstadoInscripcion: { select: { nombre: true } },
    },
  });
}

export async function updateAppliedPrice(id: number, precioAplicado: Prisma.Decimal, db: EnrollmentTransaction) {
  return db.inscripcionActividad.update({
    where: { id_inscripcion: id },
    data: { precioAplicado },
    select: { id_inscripcion: true, precioAplicado: true },
  });
}

export async function getEnrollmentPricing(userId: number, activityId: number, db: EnrollmentTransaction) {
  return {
    user: await db.usuario.findUnique({
      where: { id_usuario: userId },
      select: { socio: true },
    }),
    activity: await db.actividad.findUnique({
      where: { id_actividad: activityId },
      select: { importeSocio: true, importeNoSocio: true },
    }),
  };
}

export async function getActiveEnrollmentByUserAndActivity(
  userId: number, activityId: number, db: EnrollmentTransaction, excludedId?: number,
) {
  return db.inscripcionActividad.findFirst({
    where: {
      id_usuario: userId,
      id_actividad: activityId,
      EstadoInscripcion: { nombre: 'Activa' },
      ...(excludedId !== undefined && { id_inscripcion: { not: excludedId } }),
    },
  });
}

export async function getEnrollmentStatusByName(name: string, db: EnrollmentTransaction) {
  return db.estadoInscripcion.findUnique({ where: { nombre: name } });
}

export async function getEnrollmentStatusById(id: number, db: EnrollmentTransaction) {
  return db.estadoInscripcion.findUnique({ where: { id_estado_inscripcion: id } });
}

// Lectura fuera de la transacción serializable: dentro de ella MariaDB
// tomaría un bloqueo compartido antes de poder bloquear la actividad.
export async function getEnrollmentActivityId(id: number) {
  return prisma.inscripcionActividad.findUnique({
    where: { id_inscripcion: id },
    select: { id_actividad: true },
  });
}

export async function lockEnrollmentForUpdate(id: number, db: EnrollmentTransaction) {
  const filas = await db.$queryRaw<Array<{ id_inscripcion: number | bigint }>>`
    SELECT id_inscripcion FROM InscripcionActividad WHERE id_inscripcion = ${id} FOR UPDATE
  `;
  if (!filas[0]) return null;
  return db.inscripcionActividad.findUnique({
    where: { id_inscripcion: id },
    include: {
      MovimientoContable: { include: { TipoMovimiento: true } },
      EstadoInscripcion: { select: { nombre: true } },
    },
  });
}

function entero(valor: number | bigint | null): number | null {
  if (valor === null) return null;
  const numero = Number(valor);
  return Number.isSafeInteger(numero) ? numero : null;
}

// MariaDB trata SERIALIZABLE como lecturas compartidas. Dos altas pueden leer el
// mismo cupo a la vez. FOR UPDATE toma la fila de la actividad en exclusivo.
export async function lockActivityForEnrollment(activityId: number, db: EnrollmentTransaction) {
  const filas = await db.$queryRaw<Array<{ id_actividad: number | bigint; aforo: number | bigint | null }>>`
    SELECT id_actividad, aforo FROM Actividad WHERE id_actividad = ${activityId} FOR UPDATE
  `;
  const fila = filas[0];
  if (!fila) return null;
  const id = entero(fila.id_actividad);
  if (id === null) return null;
  return { id_actividad: id, aforo: entero(fila.aforo) };
}

export async function openEnrollmentForUpdate(
  userId: number,
  activityId: number,
  statusIds: number[],
  db: EnrollmentTransaction,
  excludedId?: number,
) {
  if (statusIds.length === 0) return null;
  const estados = Prisma.join(statusIds);
  const exclusion = excludedId === undefined
    ? Prisma.empty
    : Prisma.sql`AND id_inscripcion <> ${excludedId}`;
  const filas = await db.$queryRaw<Array<{ id_inscripcion: number | bigint }>>`
    SELECT id_inscripcion
    FROM InscripcionActividad
    WHERE id_usuario = ${userId}
      AND id_actividad = ${activityId}
      AND id_estado_inscripcion IN (${estados})
      ${exclusion}
    LIMIT 1
    FOR UPDATE
  `;
  return filas[0] ? entero(filas[0].id_inscripcion) : null;
}

export async function occupiedSeatsForUpdate(
  activityId: number,
  activeStatusId: number,
  paymentStatusIds: number[],
  db: EnrollmentTransaction,
) {
  const pagos = Prisma.join(paymentStatusIds);
  const filas = await db.$queryRaw<Array<{ id_inscripcion: number | bigint }>>`
    SELECT id_inscripcion
    FROM InscripcionActividad
    WHERE id_actividad = ${activityId}
      AND id_estado_inscripcion = ${activeStatusId}
      AND id_estado_pago IN (${pagos})
    FOR UPDATE
  `;
  return filas.length;
}

export async function firstWaitingEnrollmentForUpdate(
  activityId: number,
  waitingStatusId: number,
  db: EnrollmentTransaction,
) {
  const filas = await db.$queryRaw<Array<{ id_inscripcion: number | bigint }>>`
    SELECT id_inscripcion
    FROM InscripcionActividad
    WHERE id_actividad = ${activityId}
      AND id_estado_inscripcion = ${waitingStatusId}
    ORDER BY createAt ASC, id_inscripcion ASC
    LIMIT 1
    FOR UPDATE
  `;
  return filas[0] ? entero(filas[0].id_inscripcion) : null;
}

export async function getEnrollmentReferences(
  userId: number, activityId: number, statusId: number, methodId: number | null,
  db: EnrollmentTransaction,
) {
  return {
    user: await db.usuario.findUnique({ where: { id_usuario: userId }, select: { id_usuario: true } }),
    activity: await db.actividad.findUnique({ where: { id_actividad: activityId }, select: { id_actividad: true } }),
    status: await db.estadoInscripcion.findUnique({ where: { id_estado_inscripcion: statusId } }),
    method: methodId === null ? null : await db.metodoPago.findUnique({ where: { id_metodo_pago: methodId } }),
  };
}
