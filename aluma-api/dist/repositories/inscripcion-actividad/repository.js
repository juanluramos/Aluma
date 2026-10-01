import { prisma } from '../../config/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../errors/app-error.js';
// Las lecturas de negocio y las escrituras comparten aislamiento y reintento.
export async function withEnrollmentTransaction(operation) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            return await prisma.$transaction(operation, { isolationLevel: 'Serializable' });
        }
        catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') {
                throw error;
            }
        }
    }
    throw new AppError('Conflicto concurrente; vuelve a intentar la operación', 409, 'CONCURRENT_ENROLLMENT_UPDATE');
}
export async function getAllEnrollments(userId) {
    return prisma.inscripcionActividad.findMany({
        where: userId === undefined ? {} : { id_usuario: userId },
    });
}
export async function getEnrollmentById(id, db = prisma) {
    return db.inscripcionActividad.findUnique({ where: { id_inscripcion: id } });
}
export async function getEnrollmentWithMovements(id, db) {
    return db.inscripcionActividad.findUnique({
        where: { id_inscripcion: id },
        include: { MovimientoContable: { include: { TipoMovimiento: true } } },
    });
}
export async function createEnrollment(data, enrollmentStatusId, db) {
    return db.inscripcionActividad.create({
        data: {
            ...enrollmentFields(data),
            id_usuario: data.id_usuario, id_actividad: data.id_actividad,
            id_estado_pago: data.id_estado_pago, apuntadoFecha: data.apuntadoFecha,
            id_estado_inscripcion: enrollmentStatusId,
        },
    });
}
export async function updateEnrollment(id, data, db) {
    return db.inscripcionActividad.update({ where: { id_inscripcion: id }, data: enrollmentFields(data) });
}
function enrollmentFields(data) {
    return {
        ...(data.id_usuario !== undefined && { id_usuario: data.id_usuario }),
        ...(data.id_actividad !== undefined && { id_actividad: data.id_actividad }),
        ...(data.precioAplicado !== undefined && { precioAplicado: data.precioAplicado }),
        ...(data.id_estado_pago !== undefined && { id_estado_pago: data.id_estado_pago }),
        ...(data.id_estado_inscripcion !== undefined && { id_estado_inscripcion: data.id_estado_inscripcion }),
        ...(data.id_metodo_pago !== undefined && { id_metodo_pago: data.id_metodo_pago }),
        ...(data.apuntadoFecha !== undefined && { apuntadoFecha: data.apuntadoFecha }),
        ...(data.fechaPago !== undefined && { fechaPago: data.fechaPago }),
        ...(data.comentario !== undefined && { comentario: data.comentario }),
    };
}
export async function createEnrollmentMovement(id, movement, db) {
    return db.movimientoContable.create({ data: { ...movement, id_inscripcion: id } });
}
export async function updateEnrollmentWithMovement(id, data, movement, db) {
    // Reutilizar la escritura evita omitir id_estado_inscripcion al cerrar.
    const enrollment = await updateEnrollment(id, data, db);
    await createEnrollmentMovement(id, movement, db);
    return enrollment;
}
export async function deleteEnrollment(id, db) {
    return db.inscripcionActividad.delete({ where: { id_inscripcion: id } });
}
export async function getPaymentStatusById(id, db) {
    return db.estadoPago.findUnique({
        where: { id_estado_pago: id }, include: { TipoMovimiento: true },
    });
}
export async function getActiveEnrollmentByUserAndActivity(userId, activityId, db, excludedId) {
    return db.inscripcionActividad.findFirst({
        where: {
            id_usuario: userId,
            id_actividad: activityId,
            EstadoInscripcion: { nombre: 'Activa' },
            ...(excludedId !== undefined && { id_inscripcion: { not: excludedId } }),
        },
    });
}
export async function getEnrollmentStatusByName(name, db) {
    return db.estadoInscripcion.findUnique({ where: { nombre: name } });
}
export async function getEnrollmentReferences(userId, activityId, statusId, methodId, db) {
    return {
        user: await db.usuario.findUnique({ where: { id_usuario: userId }, select: { id_usuario: true } }),
        activity: await db.actividad.findUnique({ where: { id_actividad: activityId }, select: { id_actividad: true } }),
        status: await db.estadoInscripcion.findUnique({ where: { id_estado_inscripcion: statusId } }),
        method: methodId === null ? null : await db.metodoPago.findUnique({ where: { id_metodo_pago: methodId } }),
    };
}
//# sourceMappingURL=repository.js.map