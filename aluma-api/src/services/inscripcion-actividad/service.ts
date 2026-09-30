import {
  getAllEnrollments,
  getEnrollmentById,
  createEnrollment,
  updateEnrollment,
  updateEnrollmentWithMovement,
  deleteEnrollment,
  getPaymentStatusById,
  getActiveEnrollmentByUserAndActivity,
  getEnrollmentStatusByName,
} from '../../repositories/inscripcion-actividad/repository.js';

import {
  getRefundByEnrollmentId,
  getChargeByEnrollmentId,
} from '../../repositories/movimiento-contable/repository.js';

import type { CreateEnrollmentDto } from '../../dtos/inscripcion-actividad/create-enrollment.dto.js';

import type { UpdateEnrollmentDto } from '../../dtos/inscripcion-actividad/update-enrollment.dto.js';

import { AppError } from '../../errors/app-error.js';

/**
 * Obtiene todas las inscripciones.
 *
 * @returns Lista de inscripciones.
 */
export async function getEnrollments() {
  return getAllEnrollments();
}

/**
 * Obtiene una inscripción por su ID.
 *
 * @param id - ID de la inscripción.
 * @returns La inscripción encontrada.
 *
 * @throws AppError Si la inscripción no existe.
 */
export async function getEnrollment(id: number) {
  const enrollment = await getEnrollmentById(id);

  if (!enrollment) {
    throw new AppError('Inscripción no encontrada', 404, 'ENROLLMENT_NOT_FOUND');
  }

  return enrollment;
}

/**
 * Crea una nueva inscripción.
 *
 * Comprueba:
 * - Que no exista ya una inscripción activa
 *   para el mismo usuario y actividad.
 * - Que el estado de pago exista.
 * - Que si el estado requiere datos de pago,
 *   se haya indicado método y fecha.
 *
 * Toda nueva inscripción comienza con
 * EstadoInscripcion = Activa.
 *
 * @param data - Datos validados de la inscripción.
 * @returns La inscripción creada.
 */
export async function createNewEnrollment(data: CreateEnrollmentDto) {
  /**
   * Comprobamos si ya existe una inscripción activa
   * para el mismo usuario y actividad.
   */
  const activeEnrollment = await getActiveEnrollmentByUserAndActivity(
    data.id_usuario,
    data.id_actividad,
  );

  if (activeEnrollment) {
    throw new AppError(
      'El usuario ya tiene una inscripción activa para esta actividad',
      409,
      'ACTIVE_ENROLLMENT_ALREADY_EXISTS',
    );
  }

  /**
   * Buscamos el estado de pago seleccionado.
   */
  const paymentStatus = await getPaymentStatusById(data.id_estado_pago);

  if (!paymentStatus) {
    throw new AppError('Estado de pago no encontrado', 404, 'PAYMENT_STATUS_NOT_FOUND');
  }

  /**
   * Si el estado requiere datos de pago,
   * el método y la fecha son obligatorios.
   */
  if (paymentStatus.requiereDatosPago) {
    if (data.id_metodo_pago == null || data.fechaPago == null) {
      throw new AppError(
        'El método de pago y la fecha de pago son obligatorios para este estado',
        400,
        'PAYMENT_DATA_REQUIRED',
      );
    }
  }

  /**
   * Toda nueva inscripción comienza Activa.
   *
   * Buscamos el estado por nombre para
   * no depender de un ID fijo.
   */
  const activeEnrollmentStatus = await getEnrollmentStatusByName('Activa');

  if (!activeEnrollmentStatus) {
    throw new AppError(
      'Estado de inscripción Activa no encontrado',
      500,
      'ACTIVE_ENROLLMENT_STATUS_NOT_FOUND',
    );
  }

  return createEnrollment(data, activeEnrollmentStatus.id_estado_inscripcion);
}

/**
 * Actualiza una inscripción existente.
 *
 * Antes de actualizar, combina los datos actuales
 * con los nuevos para comprobar las reglas de negocio
 * sobre el estado final de la inscripción.
 *
 * Si el nuevo estado genera un movimiento contable,
 * la actualización y el movimiento se realizan
 * dentro de una única transacción.
 *
 * @param id - ID de la inscripción.
 * @param data - Datos que se desean actualizar.
 *
 * @returns La inscripción actualizada.
 */
export async function updateExistingEnrollment(id: number, data: UpdateEnrollmentDto) {
  /**
   * Obtenemos la inscripción actual.
   *
   * getEnrollment() ya lanza AppError si no existe.
   */
  const currentEnrollment = await getEnrollment(id);

  /**
   * Calculamos el estado de pago efectivo.
   *
   * Si llega uno nuevo usamos ese.
   * Si no, conservamos el actual.
   */
  const effectivePaymentStatusId = data.id_estado_pago ?? currentEnrollment.id_estado_pago;

  /**
   * Comprobamos si realmente ha cambiado
   * el estado de pago.
   *
   * Esto evita generar movimientos duplicados
   * cuando se modifica otro campo.
   */
  const paymentStatusChanged = effectivePaymentStatusId !== currentEnrollment.id_estado_pago;

  /**
   * Calculamos el precio efectivo.
   */
  const effectivePrice =
    data.precioAplicado !== undefined
      ? data.precioAplicado
      : currentEnrollment.precioAplicado !== null
        ? Number(currentEnrollment.precioAplicado)
        : null;

  /**
   * Calculamos el método de pago efectivo.
   *
   * undefined = conservar valor actual.
   * null = eliminar explícitamente el método.
   */
  const effectivePaymentMethodId =
    data.id_metodo_pago !== undefined ? data.id_metodo_pago : currentEnrollment.id_metodo_pago;

  /**
   * Calculamos la fecha de pago efectiva.
   *
   * undefined = conservar valor actual.
   * null = eliminar explícitamente la fecha.
   */
  const effectivePaymentDate =
    data.fechaPago !== undefined ? data.fechaPago : currentEnrollment.fechaPago;

  /**
   * Consultamos el comportamiento
   * del estado de pago.
   *
   * getPaymentStatusById incluye TipoMovimiento.
   */
  const paymentStatus = await getPaymentStatusById(effectivePaymentStatusId);

  if (!paymentStatus) {
    throw new AppError('Estado de pago no encontrado', 404, 'PAYMENT_STATUS_NOT_FOUND');
  }

  /**
   * Si el nuevo estado genera un movimiento,
   * necesitamos disponer de un precio.
   */
  if (paymentStatusChanged && paymentStatus.TipoMovimiento && effectivePrice == null) {
    throw new AppError(
      'La inscripción necesita un precio para generar el movimiento contable',
      400,
      'ENROLLMENT_PRICE_REQUIRED',
    );
  }

  /**
   * Si el estado exige datos de pago,
   * método y fecha deben existir
   * en el resultado final.
   */
  if (paymentStatus.requiereDatosPago) {
    if (effectivePaymentMethodId == null || effectivePaymentDate == null) {
      throw new AppError(
        'El método de pago y la fecha de pago son obligatorios para este estado',
        400,
        'PAYMENT_DATA_REQUIRED',
      );
    }
  }

  /**
   * Si realmente cambia el estado de pago
   * y ese estado genera un movimiento,
   * preparamos el movimiento contable.
   */
  if (paymentStatusChanged && paymentStatus.TipoMovimiento && effectivePrice !== null) {
    const movementType = paymentStatus.TipoMovimiento.nombre;

    let movementAmount: number;
    let movementConcept: string;
    let movementDate: Date;

    /**
     * COBRO
     *
     * El importe se guarda positivo.
     */
    if (movementType === 'Cobro') {
      /**
       * Una inscripción solo puede generar
       * un cobro.
       */
      const existingCharge = await getChargeByEnrollmentId(id);

      if (existingCharge) {
        throw new AppError(
          'La inscripción ya tiene un cobro registrado',
          409,
          'CHARGE_ALREADY_EXISTS',
        );
      }

      movementAmount = Math.abs(effectivePrice);

      movementConcept = 'Cobro inscripción';

      movementDate = effectivePaymentDate!;
    } else if (movementType === 'Devolución') {

    /**
     * DEVOLUCIÓN
     *
     * El importe se guarda negativo.
     * Además, la inscripción queda Cerrada.
     */
      /**
       * Una inscripción solo puede tener
       * una devolución registrada.
       */
      const existingRefund = await getRefundByEnrollmentId(id);

      if (existingRefund) {
        throw new AppError(
          'La inscripción ya tiene una devolución registrada',
          409,
          'REFUND_ALREADY_EXISTS',
        );
      }

      /**
       * Buscamos EstadoInscripcion = Cerrada
       * sin depender de un ID fijo.
       */
      const closedEnrollmentStatus = await getEnrollmentStatusByName('Cerrada');

      if (!closedEnrollmentStatus) {
        throw new AppError(
          'Estado de inscripción Cerrada no encontrado',
          500,
          'CLOSED_ENROLLMENT_STATUS_NOT_FOUND',
        );
      }

      /**
       * Cuando se devuelve una inscripción,
       * su ciclo queda cerrado.
       */
      data.id_estado_inscripcion = closedEnrollmentStatus.id_estado_inscripcion;

      /**
       * La devolución siempre se guarda
       * con importe negativo.
       */
      movementAmount = -Math.abs(effectivePrice);

      movementConcept = 'Devolución inscripción';

      /**
       * De momento utilizamos la fecha
       * en la que se realiza la devolución.
       */
      movementDate = new Date();
    } else {

    /**
     * Si aparece otro tipo de movimiento
     * automático que todavía no soportamos,
     * detenemos la operación.
     */
      throw new AppError(
        'Este tipo de movimiento no puede generarse automáticamente',
        400,
        'UNSUPPORTED_AUTOMATIC_MOVEMENT',
      );
    }

    /**
     * Actualizamos la inscripción y creamos
     * el movimiento contable dentro de
     * la misma transacción.
     */
    return updateEnrollmentWithMovement(id, data, {
      id_tipo_movimiento: paymentStatus.TipoMovimiento.id_tipo_movimiento,

      concepto: movementConcept,

      importe: movementAmount,

      fecha: movementDate,
    });
  }

  /**
   * Si no hay cambio de estado que genere
   * movimiento contable, actualizamos
   * normalmente.
   */
  return updateEnrollment(id, data);
}

/**
 * Elimina una inscripción existente.
 *
 * Comprueba primero que la inscripción exista.
 *
 * @param id - ID de la inscripción.
 * @returns La inscripción eliminada.
 */
export async function deleteExistingEnrollment(id: number) {
  await getEnrollment(id);

  return deleteEnrollment(id);
}
