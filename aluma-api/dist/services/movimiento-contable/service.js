import { getAllAccountingMovements, getAccountingMovementById, getMovementTypeById, createAccountingMovement, updateAccountingMovement, deleteAccountingMovement, } from "../../repositories/movimiento-contable/repository.js";
import { AppError } from "../../errors/app-error.js";
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
export async function getAccountingMovement(id) {
    const movement = await getAccountingMovementById(id);
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
async function validateMovementAmount(movementTypeId, amount) {
    const movementType = await getMovementTypeById(movementTypeId);
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
export async function createNewAccountingMovement(data) {
    await validateMovementAmount(data.id_tipo_movimiento, data.importe);
    return createAccountingMovement(data);
}
/**
 * Actualiza un movimiento contable existente.
 */
export async function updateExistingAccountingMovement(id, data) {
    const currentMovement = await getAccountingMovement(id);
    /**
     * Calculamos el tipo e importe efectivos,
     * igual que hicimos con InscripcionActividad.
     */
    const effectiveMovementTypeId = data.id_tipo_movimiento ??
        currentMovement.id_tipo_movimiento;
    const effectiveAmount = data.importe !== undefined
        ? data.importe
        : Number(currentMovement.importe);
    await validateMovementAmount(effectiveMovementTypeId, effectiveAmount);
    return updateAccountingMovement(id, data);
}
/**
 * Elimina un movimiento contable existente.
 */
export async function deleteExistingAccountingMovement(id) {
    await getAccountingMovement(id);
    return deleteAccountingMovement(id);
}
//# sourceMappingURL=service.js.map