import { prisma } from "../../config/prisma.js";
/**
 * Obtiene todas las actividades.
 *
 * @returns Lista de actividades.
 */
export async function getAllActivities() {
    return prisma.actividad.findMany();
}
/**
 * Obtiene una actividad por su ID.
 *
 * @param id - ID de la actividad.
 * @returns La actividad encontrada o null.
 */
export async function getActivityById(id) {
    return prisma.actividad.findUnique({
        where: {
            id_actividad: id,
        },
    });
}
/**
 * Crea una nueva actividad.
 *
 * @param data - Datos validados de la actividad.
 * @returns La actividad creada.
 */
export async function createActivity(data) {
    return prisma.actividad.create({
        data: {
            titulo: data.titulo,
            id_estado_actividad: data.id_estado_actividad,
            ...(data.fecha !== undefined && {
                fecha: data.fecha,
            }),
            ...(data.importeSocio !== undefined && {
                importeSocio: data.importeSocio,
            }),
            ...(data.importeNoSocio !== undefined && {
                importeNoSocio: data.importeNoSocio,
            }),
            ...(data.comentario !== undefined && {
                comentario: data.comentario,
            }),
        },
    });
}
/**
 * Actualiza una actividad existente.
 *
 * Solo envía a Prisma los campos que realmente
 * hayan sido recibidos.
 *
 * @param id - ID de la actividad.
 * @param data - Datos a actualizar.
 * @returns La actividad actualizada.
 */
export async function updateActivity(id, data) {
    return prisma.actividad.update({
        where: {
            id_actividad: id,
        },
        data: {
            ...(data.titulo !== undefined && {
                titulo: data.titulo,
            }),
            ...(data.fecha !== undefined && {
                fecha: data.fecha,
            }),
            ...(data.importeSocio !== undefined && {
                importeSocio: data.importeSocio,
            }),
            ...(data.importeNoSocio !== undefined && {
                importeNoSocio: data.importeNoSocio,
            }),
            ...(data.id_estado_actividad !== undefined && {
                id_estado_actividad: data.id_estado_actividad,
            }),
            ...(data.comentario !== undefined && {
                comentario: data.comentario,
            }),
        },
    });
}
/**
 * Elimina una actividad por su ID.
 *
 * @param id - ID de la actividad.
 * @returns La actividad eliminada.
 */
export async function deleteActivity(id) {
    return prisma.actividad.delete({
        where: {
            id_actividad: id,
        },
    });
}
//# sourceMappingURL=respository.js.map