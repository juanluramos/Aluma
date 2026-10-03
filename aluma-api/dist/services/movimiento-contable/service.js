import { getAllAccountingMovements, getAccountingMovementById, getMovementTypeById, createAccountingMovement, updateAccountingMovement, deleteAccountingMovement, } from "../../repositories/movimiento-contable/repository.js";
import { AppError } from "../../errors/app-error.js";
import { prisma } from "../../config/prisma.js";
import { createAudit } from "../auditoria/service.js";
/**
 * Obtiene todos los movimientos contables.
 */
export async function getAccountingMovements() {
    return getAllAccountingMovements();
}
/**
 * Obtiene un movimiento contable por ID.
 *
 * @param id - ID del movimiento.
 * @throws AppError Si el movimiento no existe.
 */
export async function getAccountingMovement(id, client = prisma) {
    const movement = await getAccountingMovementById(id, client);
    if (!movement) {
        throw new AppError("Movimiento contable no encontrado", 404, "ACCOUNTING_MOVEMENT_NOT_FOUND");
    }
    return movement;
}
/**
 * Valida el signo del importe según el tipo de movimiento.
 *
 * Cobro       -> importe positivo.
 * Devolución  -> importe negativo.
 * Ajuste      -> positivo o negativo.
 */
async function validateMovementAmount(movementTypeId, amount, client = prisma) {
    const movementType = await getMovementTypeById(movementTypeId, client);
    if (!movementType) {
        throw new AppError("Tipo de movimiento no encontrado", 404, "MOVEMENT_TYPE_NOT_FOUND");
    }
    if (movementType.nombre === "Cobro" && amount <= 0) {
        throw new AppError("Un cobro debe tener un importe positivo", 400, "INVALID_MOVEMENT_AMOUNT");
    }
    if (movementType.nombre === "Devolución" &&
        amount >= 0) {
        throw new AppError("Una devolución debe tener un importe negativo", 400, "INVALID_MOVEMENT_AMOUNT");
    }
    return movementType;
}
/**
 * Crea un nuevo movimiento contable.
 */
export async function createNewAccountingMovement(data, context) {
    assertIndependentMovement(data.id_inscripcion);
    await validateMovementAmount(data.id_tipo_movimiento, data.importe);
    return prisma.$transaction(async (tx) => {
        const movement = await createAccountingMovement(data, tx);
        await createAudit({
            requestId: context.requestId,
            id_usuario: context.id_usuario,
            rol_actor: context.rol_actor,
            accion: 'MOVIMIENTO_CREADO',
            recurso: 'MOVIMIENTO_CONTABLE',
            id_recurso: movement.id_movimiento,
            resultado: 'REALIZADA',
            codigo_error: null,
            detalles: null,
        }, tx);
        return movement;
    });
}
/**
 * Actualiza un movimiento contable existente.
 */
export async function updateExistingAccountingMovement(id, data, context) {
    return prisma.$transaction(async (tx) => {
        const currentMovement = await getAccountingMovement(id, tx);
        assertIndependentMovement(currentMovement.id_inscripcion);
        assertIndependentMovement(data.id_inscripcion);
        const effectiveMovementTypeId = data.id_tipo_movimiento ?? currentMovement.id_tipo_movimiento;
        const effectiveAmount = data.importe !== undefined ? data.importe : Number(currentMovement.importe);
        await validateMovementAmount(effectiveMovementTypeId, effectiveAmount, tx);
        const updated = await updateAccountingMovement(id, data, tx);
        const values = (row) => ({
            id_tipo_movimiento: row.id_tipo_movimiento,
            concepto: row.concepto,
            importe: row.importe.toFixed(2),
            fecha: row.fecha.toISOString().slice(0, 10),
            id_inscripcion: row.id_inscripcion,
            comentario: row.comentario,
        });
        const before = values(currentMovement);
        const after = values(updated);
        const cambios = {};
        for (const field of Object.keys(before)) {
            if (before[field] !== after[field]) {
                // Comparar texto real, pero no copiar texto libre potencialmente sensible.
                const privateText = field === 'concepto' || field === 'comentario';
                cambios[field] = {
                    anterior: privateText && before[field] !== null ? '[REDACTADO]' : before[field],
                    nuevo: privateText && after[field] !== null ? '[REDACTADO]' : after[field],
                };
            }
        }
        if (Object.keys(cambios).length > 0) {
            await createAudit({
                requestId: context.requestId,
                id_usuario: context.id_usuario,
                rol_actor: context.rol_actor,
                accion: 'MOVIMIENTO_MODIFICADO',
                recurso: 'MOVIMIENTO_CONTABLE',
                id_recurso: updated.id_movimiento,
                resultado: 'REALIZADA',
                codigo_error: null,
                detalles: { cambios },
            }, tx);
        }
        return updated;
    });
}
/**
 * Elimina un movimiento contable existente.
 */
export async function deleteExistingAccountingMovement(id, context) {
    return prisma.$transaction(async (tx) => {
        const movement = await getAccountingMovement(id, tx);
        assertIndependentMovement(movement.id_inscripcion);
        const deleted = await deleteAccountingMovement(id, tx);
        await createAudit({
            requestId: context.requestId,
            id_usuario: context.id_usuario,
            rol_actor: context.rol_actor,
            accion: 'MOVIMIENTO_ELIMINADO',
            recurso: 'MOVIMIENTO_CONTABLE',
            id_recurso: deleted.id_movimiento,
            resultado: 'REALIZADA',
            codigo_error: null,
            detalles: null,
        }, tx);
        return deleted;
    });
}
function assertIndependentMovement(enrollmentId) {
    if (enrollmentId != null) {
        throw new AppError("Los movimientos de inscripción solo se gestionan desde la inscripción", 409, "ENROLLMENT_MOVEMENT_PROTECTED");
    }
}
//# sourceMappingURL=service.js.map