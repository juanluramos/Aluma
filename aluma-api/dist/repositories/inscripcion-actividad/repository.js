import { prisma } from '../../config/prisma.js';
/**
 * Obtiene todas las inscripciones.
 *
 * @returns Lista de inscripciones.
 */
export async function getAllEnrollments() {
    return prisma.inscripcionActividad.findMany();
}
/**
 * Obtiene una inscripción por su ID.
 *
 * @param id - ID de la inscripción.
 * @returns La inscripción encontrada o null.
 */
export async function getEnrollmentById(id) {
    return prisma.inscripcionActividad.findUnique({
        where: {
            id_inscripcion: id,
        },
    });
}
/**
 * Crea una nueva inscripción.
 *
 * @param data - Datos validados de la inscripción.
 * @returns La inscripción creada.
 */
export async function createEnrollment(data, enrollmentStatusId) {
    return prisma.inscripcionActividad.create({
        data: {
            id_usuario: data.id_usuario,
            id_actividad: data.id_actividad,
            id_estado_pago: data.id_estado_pago,
            id_estado_inscripcion: enrollmentStatusId,
            apuntadoFecha: data.apuntadoFecha,
            ...(data.precioAplicado !== undefined && {
                precioAplicado: data.precioAplicado,
            }),
            ...(data.id_metodo_pago !== undefined && {
                id_metodo_pago: data.id_metodo_pago,
            }),
            ...(data.fechaPago !== undefined && {
                fechaPago: data.fechaPago,
            }),
            ...(data.comentario !== undefined && {
                comentario: data.comentario,
            }),
        },
    });
}
/**
 * Actualiza una inscripción existente.
 *
 * Solo se envían a Prisma los campos
 * que realmente hayan sido recibidos.
 *
 * @param id - ID de la inscripción.
 * @param data - Datos a actualizar.
 * @returns La inscripción actualizada.
 */
export async function updateEnrollment(id, data) {
    return prisma.inscripcionActividad.update({
        where: {
            id_inscripcion: id,
        },
        data: {
            ...(data.id_usuario !== undefined && {
                id_usuario: data.id_usuario,
            }),
            ...(data.id_actividad !== undefined && {
                id_actividad: data.id_actividad,
            }),
            ...(data.precioAplicado !== undefined && {
                precioAplicado: data.precioAplicado,
            }),
            ...(data.id_estado_pago !== undefined && {
                id_estado_pago: data.id_estado_pago,
            }),
            ...(data.id_metodo_pago !== undefined && {
                id_metodo_pago: data.id_metodo_pago,
            }),
            ...(data.apuntadoFecha !== undefined && {
                apuntadoFecha: data.apuntadoFecha,
            }),
            ...(data.fechaPago !== undefined && {
                fechaPago: data.fechaPago,
            }),
            ...(data.comentario !== undefined && {
                comentario: data.comentario,
            }),
            ...(data.id_estado_inscripcion !== undefined && {
                id_estado_inscripcion: data.id_estado_inscripcion,
            }),
            ...(data.id_estado_inscripcion !== undefined && {
                id_estado_inscripcion: data.id_estado_inscripcion,
            }),
        },
    });
}
/**
 * Elimina una inscripción por su ID.
 *
 * @param id - ID de la inscripción.
 * @returns La inscripción eliminada.
 */
export async function deleteEnrollment(id) {
    return prisma.inscripcionActividad.delete({
        where: {
            id_inscripcion: id,
        },
    });
}
/**
 * Obtiene un estado de pago por su ID
 * incluyendo el tipo de movimiento asociado.
 *
 * @param id - ID del estado de pago.
 */
export async function getPaymentStatusById(id) {
    return prisma.estadoPago.findUnique({
        where: {
            id_estado_pago: id,
        },
        include: {
            TipoMovimiento: true,
        },
    });
}
/**
 * Actualiza una inscripción y crea su movimiento contable
 * dentro de una única transacción.
 *
 * Si una de las dos operaciones falla,
 * Prisma deshace ambas.
 */
export async function updateEnrollmentWithMovement(id, data, movement) {
    return prisma.$transaction(async (tx) => {
        /**
         * 1. Actualizamos la inscripción.
         */
        const updatedEnrollment = await tx.inscripcionActividad.update({
            where: {
                id_inscripcion: id,
            },
            data: {
                ...(data.id_usuario !== undefined && {
                    id_usuario: data.id_usuario,
                }),
                ...(data.id_actividad !== undefined && {
                    id_actividad: data.id_actividad,
                }),
                ...(data.precioAplicado !== undefined && {
                    precioAplicado: data.precioAplicado,
                }),
                ...(data.id_estado_pago !== undefined && {
                    id_estado_pago: data.id_estado_pago,
                }),
                ...(data.id_metodo_pago !== undefined && {
                    id_metodo_pago: data.id_metodo_pago,
                }),
                ...(data.apuntadoFecha !== undefined && {
                    apuntadoFecha: data.apuntadoFecha,
                }),
                ...(data.fechaPago !== undefined && {
                    fechaPago: data.fechaPago,
                }),
                ...(data.comentario !== undefined && {
                    comentario: data.comentario,
                }),
            },
        });
        /**
         * 2. Creamos el movimiento contable asociado.
         */
        await tx.movimientoContable.create({
            data: {
                id_tipo_movimiento: movement.id_tipo_movimiento,
                concepto: movement.concepto,
                importe: movement.importe,
                fecha: movement.fecha,
                id_inscripcion: id,
            },
        });
        return updatedEnrollment;
    });
}
/**
 * Busca una inscripción activa para un usuario y una actividad.
 *
 * @param userId - ID del usuario.
 * @param activityId - ID de la actividad.
 * @returns La inscripción activa encontrada o null.
 */
export async function getActiveEnrollmentByUserAndActivity(userId, activityId) {
    return prisma.inscripcionActividad.findFirst({
        where: {
            id_usuario: userId,
            id_actividad: activityId,
            EstadoInscripcion: {
                nombre: 'Activa',
            },
        },
    });
}
/**
 * Obtiene un estado de inscripción por su nombre.
 *
 * @param name - Nombre del estado.
 * @returns El estado encontrado o null.
 */
export async function getEnrollmentStatusByName(name) {
    return prisma.estadoInscripcion.findUnique({
        where: {
            nombre: name,
        },
    });
}
//# sourceMappingURL=repository.js.map