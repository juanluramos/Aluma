import { AppError } from '../../errors/app-error.js';
import {
  getEnrollmentActivityId, getEnrollmentStatusByName, getPaymentStatusById,
  getPaymentStatusByName, lockActivityForEnrollment, lockEnrollmentForUpdate,
  occupiedSeatsForUpdate, openEnrollmentForUpdate, firstWaitingEnrollmentForUpdate,
  promoteEnrollmentStatus, withEnrollmentTransaction,
} from '../../repositories/inscripcion-actividad/repository.js';
import { createAudit } from '../auditoria/service.js';

export interface EnrollmentPromotionAuditContext {
  requestId: string;
  id_usuario: number;
  rol_actor: string;
}

export async function promoteWaitingEnrollment(id: number, context: EnrollmentPromotionAuditContext) {
  const hint = await getEnrollmentActivityId(id);
  if (!hint) throw new AppError('Inscripción no encontrada', 404, 'ENROLLMENT_NOT_FOUND');
  return withEnrollmentTransaction(async (tx) => {
    const activity = await lockActivityForEnrollment(hint.id_actividad, tx);
    if (!activity) {
      throw new AppError('Usuario, actividad, estado o método de pago no encontrado', 404, 'ENROLLMENT_REFERENCE_NOT_FOUND');
    }
    const current = await lockEnrollmentForUpdate(id, tx);
    if (!current) throw new AppError('Inscripción no encontrada', 404, 'ENROLLMENT_NOT_FOUND');
    if (current.id_actividad !== hint.id_actividad) {
      throw new AppError('Conflicto concurrente; vuelve a intentar la operación', 409, 'CONCURRENT_ENROLLMENT_UPDATE');
    }
    if (current.EstadoInscripcion.nombre !== 'En espera') {
      throw new AppError('Solo se puede activar una inscripción en espera', 409, 'ENROLLMENT_NOT_WAITING');
    }
    const payment = await getPaymentStatusById(current.id_estado_pago, tx);
    if (!payment) throw new AppError('Estado de pago no encontrado', 404, 'PAYMENT_STATUS_NOT_FOUND');
    if (payment.nombre_estado !== 'Pendiente') {
      throw new AppError('Solo se puede activar una inscripción pendiente de pago', 409, 'ENROLLMENT_PAYMENT_NOT_PENDING');
    }
    const active = await getEnrollmentStatusByName('Activa', tx);
    if (!active) throw new AppError('Estado Activa no encontrado', 500, 'ACTIVE_ENROLLMENT_STATUS_NOT_FOUND');
    const waiting = await getEnrollmentStatusByName('En espera', tx);
    if (!waiting) throw new AppError('Estado En espera no encontrado', 500, 'WAITLIST_ENROLLMENT_STATUS_NOT_FOUND');
    const pending = await getPaymentStatusByName('Pendiente', tx);
    const paid = await getPaymentStatusByName('Pagado', tx);
    if (!pending || !paid) {
      throw new AppError('Estado Pendiente no encontrado', 500, 'PENDING_PAYMENT_STATUS_NOT_FOUND');
    }
    const abierta = await openEnrollmentForUpdate(
      current.id_usuario,
      current.id_actividad,
      [active.id_estado_inscripcion, waiting.id_estado_inscripcion],
      tx,
      id,
    );
    if (abierta !== null) {
      throw new AppError(
        'El usuario ya tiene una inscripción activa para esta actividad',
        409,
        'ACTIVE_ENROLLMENT_ALREADY_EXISTS',
      );
    }
    const cabeza = await firstWaitingEnrollmentForUpdate(
      current.id_actividad, waiting.id_estado_inscripcion, tx,
    );
    if (cabeza !== id) {
      throw new AppError('Solo se puede activar la primera inscripción en espera', 409, 'WAITLIST_PROMOTION_OUT_OF_TURN');
    }
    const ocupadas = await occupiedSeatsForUpdate(
      current.id_actividad,
      active.id_estado_inscripcion,
      [pending.id_estado_pago, paid.id_estado_pago],
      tx,
    );
    if (activity.aforo !== null && ocupadas >= activity.aforo) {
      throw new AppError('No hay plaza disponible', 409, 'ENROLLMENT_CAPACITY_EXCEEDED');
    }
    const enrollment = await promoteEnrollmentStatus(id, active.id_estado_inscripcion, tx);
    await createAudit({
      requestId: context.requestId,
      id_usuario: context.id_usuario,
      rol_actor: context.rol_actor,
      accion: 'INSCRIPCION_ACTIVADA',
      recurso: 'INSCRIPCION_ACTIVIDAD',
      id_recurso: id,
      resultado: 'REALIZADA',
      codigo_error: null,
      detalles: { id_estado_inscripcion: { anterior: 'En espera', nuevo: 'Activa' } },
    }, tx);
    return enrollment;
  });
}
