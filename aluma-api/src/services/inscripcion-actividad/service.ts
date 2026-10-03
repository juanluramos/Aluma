import {
  getAllEnrollments, getEnrollmentById, getEnrollmentWithMovements,
  createEnrollment, createEnrollmentMovement, updateEnrollment,
  deleteEnrollment, getPaymentStatusById,
  getActiveEnrollmentByUserAndActivity, getEnrollmentStatusByName,
  getEnrollmentReferences, withEnrollmentTransaction,
} from '../../repositories/inscripcion-actividad/repository.js';
import type { EnrollmentTransaction, EnrollmentMovement } from '../../repositories/inscripcion-actividad/repository.js';
import type { CreateEnrollmentDto } from '../../dtos/inscripcion-actividad/create-enrollment.dto.js';
import type { UpdateEnrollmentDto } from '../../dtos/inscripcion-actividad/update-enrollment.dto.js';
import { AppError } from '../../errors/app-error.js';
import { createAudit } from '../auditoria/service.js';

export interface EnrollmentCreationAuditContext {
  requestId: string;
  id_usuario: number;
  rol_actor: string;
}

export async function getEnrollments(userId?: number) {
  return getAllEnrollments(userId);
}

export async function getEnrollment(id: number, ownerId?: number) {
  const enrollment = await getEnrollmentById(id);
  if (!enrollment) {
    throw new AppError('Inscripción no encontrada', 404, 'ENROLLMENT_NOT_FOUND');
  }
  if (ownerId !== undefined && enrollment.id_usuario !== ownerId) {
    throw new AppError('No tienes permisos para consultar esta inscripción', 403, 'FORBIDDEN');
  }
  return enrollment;
}

type EnrollmentValues = {
  id_usuario: number;
  id_actividad: number;
  id_estado_inscripcion: number;
  precioAplicado: number | null;
  id_metodo_pago: number | null;
  fechaPago: Date | null;
};

async function paymentStatus(id: number, tx: EnrollmentTransaction) {
  const status = await getPaymentStatusById(id, tx);
  if (!status) {
    throw new AppError('Estado de pago no encontrado', 404, 'PAYMENT_STATUS_NOT_FOUND');
  }
  const types: Record<string, string | null> = {
    Pendiente: null, Cancelado: null, Pagado: 'Cobro', 'Devolución': 'Devolución',
  };
  if (!(status.nombre_estado in types) || types[status.nombre_estado] !== (status.TipoMovimiento?.nombre ?? null)) {
    throw new AppError('Configuración de estado de pago no soportada', 409, 'UNSUPPORTED_PAYMENT_STATUS');
  }
  return status;
}

async function validateReferences(values: EnrollmentValues, tx: EnrollmentTransaction, excludedId?: number) {
  const refs = await getEnrollmentReferences(
    values.id_usuario, values.id_actividad, values.id_estado_inscripcion, values.id_metodo_pago, tx,
  );
  if (!refs.user || !refs.activity || !refs.status || (values.id_metodo_pago !== null && !refs.method)) {
    throw new AppError('Usuario, actividad, estado o método de pago no encontrado', 404, 'ENROLLMENT_REFERENCE_NOT_FOUND');
  }
  if (refs.status.nombre === 'Activa' && await getActiveEnrollmentByUserAndActivity(
    values.id_usuario, values.id_actividad, tx, excludedId,
  )) {
    throw new AppError('El usuario ya tiene una inscripción activa para esta actividad', 409, 'ACTIVE_ENROLLMENT_ALREADY_EXISTS');
  }
  return refs.status;
}

function validatePaymentData(status: Awaited<ReturnType<typeof paymentStatus>>, values: EnrollmentValues) {
  if ((status.requiereDatosPago || status.nombre_estado === 'Pagado') &&
      (values.id_metodo_pago === null || values.fechaPago === null)) {
    throw new AppError('El método y la fecha de pago son obligatorios', 400, 'PAYMENT_DATA_REQUIRED');
  }
}

function chargeMovement(status: Awaited<ReturnType<typeof paymentStatus>>, values: EnrollmentValues): EnrollmentMovement {
  if (values.precioAplicado === null || values.precioAplicado <= 0) {
    throw new AppError('El cobro requiere un precio positivo', 400, 'ENROLLMENT_PRICE_REQUIRED');
  }
  return {
    id_tipo_movimiento: status.TipoMovimiento!.id_tipo_movimiento,
    concepto: 'Cobro inscripción', importe: values.precioAplicado, fecha: values.fechaPago!,
  };
}

export async function createNewEnrollment(data: CreateEnrollmentDto, context: EnrollmentCreationAuditContext) {
  return withEnrollmentTransaction(async (tx) => {
    const status = await paymentStatus(data.id_estado_pago, tx);
    if (status.nombre_estado === 'Devolución') {
      throw new AppError('La devolución requiere un cobro previo válido', 409, 'VALID_CHARGE_REQUIRED');
    }
    const active = await getEnrollmentStatusByName('Activa', tx);
    if (!active) {
      throw new AppError('Estado Activa no encontrado', 500, 'ACTIVE_ENROLLMENT_STATUS_NOT_FOUND');
    }
    const values: EnrollmentValues = {
      ...data, id_estado_inscripcion: active.id_estado_inscripcion,
      precioAplicado: data.precioAplicado ?? null,
      id_metodo_pago: data.id_metodo_pago ?? null, fechaPago: data.fechaPago ?? null,
    };
    await validateReferences(values, tx);
    validatePaymentData(status, values);
    const movement = status.nombre_estado === 'Pagado' ? chargeMovement(status, values) : null;
    const enrollment = await createEnrollment(data, active.id_estado_inscripcion, tx);
    const charge = movement ? await createEnrollmentMovement(enrollment.id_inscripcion, movement, tx) : null;
    const auditContext = {
      requestId: context.requestId,
      id_usuario: context.id_usuario,
      rol_actor: context.rol_actor,
      recurso: 'INSCRIPCION_ACTIVIDAD' as const,
      id_recurso: enrollment.id_inscripcion,
      resultado: 'REALIZADA' as const,
      codigo_error: null,
    };
    await createAudit({ ...auditContext, accion: 'INSCRIPCION_CREADA', detalles: null }, tx);
    if (charge) {
      await createAudit({
        ...auditContext,
        accion: 'INSCRIPCION_COBRADA',
        detalles: { importe: charge.importe.toFixed(2), id_movimiento: charge.id_movimiento },
      }, tx);
    }
    return enrollment;
  });
}

function comparable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

export async function updateExistingEnrollment(id: number, data: UpdateEnrollmentDto, context: EnrollmentCreationAuditContext) {
  return withEnrollmentTransaction(async (tx) => {
    const current = await getEnrollmentWithMovements(id, tx);
    if (!current) throw new AppError('Inscripción no encontrada', 404, 'ENROLLMENT_NOT_FOUND');
    // Solo los caminos administrativos llaman a esta escritura auditada.
    async function updateAdministrativeEnrollment() {
      const updated = await updateEnrollment(id, data, tx);
      const values = (row: typeof updated) => ({
        id_usuario: row.id_usuario,
        id_actividad: row.id_actividad,
        precioAplicado: row.precioAplicado?.toFixed(2) ?? null,
        id_estado_pago: row.id_estado_pago,
        id_estado_inscripcion: row.id_estado_inscripcion,
        id_metodo_pago: row.id_metodo_pago,
        apuntadoFecha: row.apuntadoFecha.toISOString().slice(0, 10),
        fechaPago: row.fechaPago?.toISOString().slice(0, 10) ?? null,
        comentario: row.comentario,
      });
      const before = values(current!);
      const after = values(updated);
      const cambios: Record<string, { anterior: string | number | null; nuevo: string | number | null } | { modificado: true }> = {};
      for (const field of Object.keys(before) as (keyof typeof before)[]) {
        if (before[field] !== after[field]) {
          // El texto libre puede contener datos sensibles: registrar solo que cambió.
          cambios[field] = field === 'comentario'
            ? { modificado: true }
            : { anterior: before[field], nuevo: after[field] };
        }
      }
      if (Object.keys(cambios).length > 0) {
        await createAudit({
          requestId: context.requestId,
          id_usuario: context.id_usuario,
          rol_actor: context.rol_actor,
          accion: 'INSCRIPCION_MODIFICADA',
          recurso: 'INSCRIPCION_ACTIVIDAD',
          id_recurso: updated.id_inscripcion,
          resultado: 'REALIZADA',
          codigo_error: null,
          detalles: { cambios },
        }, tx);
      }
      return updated;
    }
    const currentStatus = await paymentStatus(current.id_estado_pago, tx);
    const status = await paymentStatus(data.id_estado_pago ?? current.id_estado_pago, tx);
    const values: EnrollmentValues = {
      id_usuario: data.id_usuario ?? current.id_usuario,
      id_actividad: data.id_actividad ?? current.id_actividad,
      id_estado_inscripcion: data.id_estado_inscripcion ?? current.id_estado_inscripcion,
      precioAplicado: data.precioAplicado !== undefined ? data.precioAplicado :
        current.precioAplicado === null ? null : Number(current.precioAplicado),
      id_metodo_pago: data.id_metodo_pago !== undefined ? data.id_metodo_pago : current.id_metodo_pago,
      fechaPago: data.fechaPago !== undefined ? data.fechaPago : current.fechaPago,
    };
    const movements = current.MovimientoContable;
    const charges = movements.filter((m) => m.TipoMovimiento.nombre === 'Cobro');
    const refunds = movements.filter((m) => m.TipoMovimiento.nombre === 'Devolución');
    const charge = charges[0];
    const refund = refunds[0];
    const changed = Object.keys(data).filter((key) => {
      const field = key as keyof UpdateEnrollmentDto;
      const before = field === 'precioAplicado' ?
        current.precioAplicado === null ? null : Number(current.precioAplicado) : current[field];
      return comparable(data[field]) !== comparable(before);
    });

    if (movements.length > 0) {
      // No corregimos historiales incoherentes mediante un PUT ordinario.
      const validCharge = charges.length === 1 && charge && Number(charge.importe) > 0 &&
        Number(charge.importe) === Number(current.precioAplicado) &&
        current.id_metodo_pago !== null && current.fechaPago !== null &&
        comparable(charge.fecha) === comparable(current.fechaPago);
      const validRefund = refunds.length === 0 || (refund && refunds.length === 1 &&
        Number(refund.importe) === -Number(charge?.importe));
      if (!validCharge || !validRefund || movements.length !== charges.length + refunds.length ||
          currentStatus.nombre_estado !== (refund ? 'Devolución' : 'Pagado')) {
        throw new AppError('El historial contable requiere revisión', 409, 'INCONSISTENT_ACCOUNTING_HISTORY');
      }
      const isRefund = !refund && status.nombre_estado === 'Devolución';
      const allowed = isRefund ? ['comentario', 'id_estado_pago', 'id_estado_inscripcion'] : ['comentario'];
      if (changed.some((field) => !allowed.includes(field))) {
        throw new AppError('Los campos están bloqueados por movimientos contables', 409, 'ENROLLMENT_ACCOUNTING_LOCKED');
      }
      if (isRefund) {
        const closed = await getEnrollmentStatusByName('Cerrada', tx);
        if (!closed) throw new AppError('Estado Cerrada no encontrado', 500, 'CLOSED_ENROLLMENT_STATUS_NOT_FOUND');
        if (data.id_estado_inscripcion !== undefined && data.id_estado_inscripcion !== closed.id_estado_inscripcion) {
          throw new AppError('La devolución debe cerrar la inscripción', 409, 'REFUND_REQUIRES_CLOSED_ENROLLMENT');
        }
        const updated = await updateEnrollment(id, { ...data, id_estado_inscripcion: closed.id_estado_inscripcion }, tx);
        const movement = await createEnrollmentMovement(id, {
          id_tipo_movimiento: status.TipoMovimiento!.id_tipo_movimiento,
          concepto: 'Devolución inscripción', importe: -Number(charge!.importe), fecha: new Date(),
        }, tx);
        await createAudit({
          requestId: context.requestId,
          id_usuario: context.id_usuario,
          rol_actor: context.rol_actor,
          accion: 'INSCRIPCION_DEVUELTA',
          recurso: 'INSCRIPCION_ACTIVIDAD',
          id_recurso: id,
          resultado: 'REALIZADA',
          codigo_error: null,
          detalles: { importe: movement.importe.toFixed(2), id_movimiento: movement.id_movimiento },
        }, tx);
        return updated;
      }
      return updateAdministrativeEnrollment();
    }

    if (status.nombre_estado === 'Devolución') {
      throw new AppError('La devolución requiere un cobro previo válido', 409, 'VALID_CHARGE_REQUIRED');
    }
    if (currentStatus.TipoMovimiento) {
      throw new AppError('El estado de pago no tiene su movimiento contable', 409, 'INCONSISTENT_ACCOUNTING_HISTORY');
    }
    const enrollmentStatus = await validateReferences(values, tx, id);
    validatePaymentData(status, values);
    if (status.nombre_estado === 'Pagado') {
      if (enrollmentStatus.nombre !== 'Activa') {
        throw new AppError('Solo se puede cobrar una inscripción activa', 409, 'ACTIVE_ENROLLMENT_REQUIRED');
      }
      const movement = chargeMovement(status, values);
      const updated = await updateEnrollment(id, data, tx);
      const charge = await createEnrollmentMovement(id, movement, tx);
      await createAudit({
        requestId: context.requestId,
        id_usuario: context.id_usuario,
        rol_actor: context.rol_actor,
        accion: 'INSCRIPCION_COBRADA',
        recurso: 'INSCRIPCION_ACTIVIDAD',
        id_recurso: id,
        resultado: 'REALIZADA',
        codigo_error: null,
        detalles: { importe: charge.importe.toFixed(2), id_movimiento: charge.id_movimiento },
      }, tx);
      return updated;
    }
    return updateAdministrativeEnrollment();
  });
}

export async function deleteExistingEnrollment(id: number, context: EnrollmentCreationAuditContext) {
  return withEnrollmentTransaction(async (tx) => {
    const enrollment = await getEnrollmentWithMovements(id, tx);
    if (!enrollment) throw new AppError('Inscripción no encontrada', 404, 'ENROLLMENT_NOT_FOUND');
    if (enrollment.MovimientoContable.length > 0) {
      throw new AppError('No se puede borrar una inscripción con movimientos contables', 409, 'ENROLLMENT_HAS_MOVEMENTS');
    }
    const deleted = await deleteEnrollment(id, tx);
    await createAudit({
      requestId: context.requestId,
      id_usuario: context.id_usuario,
      rol_actor: context.rol_actor,
      accion: 'INSCRIPCION_ELIMINADA',
      recurso: 'INSCRIPCION_ACTIVIDAD',
      id_recurso: deleted.id_inscripcion,
      resultado: 'REALIZADA',
      codigo_error: null,
      detalles: null,
    }, tx);
    return deleted;
  });
}
