import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../errors/app-error.js';
import { createAudit as persistAudit } from '../../repositories/auditoria/repository.js';
export const AUDIT_RESULTS = ['REALIZADA', 'RECHAZADA'];
export const AUDIT_RESOURCES = [
    'USUARIO', 'ACTIVIDAD', 'INSCRIPCION_ACTIVIDAD',
    'MOVIMIENTO_CONTABLE', 'AUTENTICACION', 'PETICION_HTTP',
];
export const AUDIT_ACTIONS = [
    'USUARIO_CREADO', 'USUARIO_MODIFICADO', 'USUARIO_ELIMINADO',
    'ACTIVIDAD_CREADA', 'ACTIVIDAD_MODIFICADA', 'ACTIVIDAD_ELIMINADA',
    'INSCRIPCION_CREADA', 'INSCRIPCION_MODIFICADA', 'INSCRIPCION_COBRADA',
    'INSCRIPCION_DEVUELTA', 'INSCRIPCION_ELIMINADA',
    'MOVIMIENTO_CREADO', 'MOVIMIENTO_MODIFICADO', 'MOVIMIENTO_ELIMINADO',
    'LOGIN_CORRECTO', 'LOGIN_REALIZADO', 'LOGIN_RECHAZADO', 'ACCESO_RECHAZADO',
    'VALIDACION_RECHAZADA', 'OPERACION_RECHAZADA',
];
const historicalId = z.number().int().positive().max(2147483647).nullable().optional();
const createAuditSchema = z.strictObject({
    requestId: z.uuid(),
    id_usuario: historicalId,
    rol_actor: z.string().min(1).max(30).nullable().optional(),
    accion: z.enum(AUDIT_ACTIONS),
    recurso: z.enum(AUDIT_RESOURCES),
    id_recurso: historicalId,
    resultado: z.enum(AUDIT_RESULTS),
    codigo_error: z.string().min(1).max(64).nullable().optional(),
    detalles: z.record(z.string(), z.json()).nullable().optional(),
});
export async function createAudit(data, client) {
    const parsed = createAuditSchema.safeParse(data);
    if (!parsed.success) {
        throw new AppError('Datos de auditoria no validos', 400, 'AUDIT_VALIDATION_ERROR');
    }
    const values = parsed.data;
    return persistAudit({
        requestId: values.requestId,
        id_usuario: values.id_usuario ?? null,
        rol_actor: values.rol_actor ?? null,
        accion: values.accion,
        recurso: values.recurso,
        id_recurso: values.id_recurso ?? null,
        resultado: values.resultado,
        codigo_error: values.codigo_error ?? null,
        // Prisma distingue NULL SQL del valor null dentro de un documento JSON.
        detalles: values.detalles ?? Prisma.DbNull,
    }, client);
}
//# sourceMappingURL=service.js.map