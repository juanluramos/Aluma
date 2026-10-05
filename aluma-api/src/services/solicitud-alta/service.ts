import { prisma } from '../../config/prisma.js';
import { AppError } from '../../errors/app-error.js';
import { createUser } from '../../repositories/usuario/repository.js';
import { createOAuthAccount } from '../../repositories/auth/repository.js';
import * as repository from '../../repositories/solicitud-alta/repository.js';
import type { OAuthRegisterDto } from '../../dtos/auth/oauth-register.dto.js';
import type { ResolveSolicitudDto } from '../../dtos/solicitud-alta/dto.js';
import type { RegistrationIdentity } from '../../utils/registration-token.js';

export async function submitSolicitud(identity: RegistrationIdentity, data: OAuthRegisterDto) {
  return prisma.$transaction(async tx => {
    if (await repository.findSolicitud(identity, tx)) throw new AppError('Ya existe una solicitud para esta identidad', 409, 'APPLICATION_EXISTS');
    if (await tx.usuario.findUnique({ where: { email: identity.email } }) || await tx.cuentaAutenticacion.findFirst({ where: { proveedor: identity.proveedor, external_id: identity.external_id } })) {
      throw new AppError('La identidad ya está registrada; vuelve a iniciar sesión', 409, 'IDENTITY_ALREADY_REGISTERED');
    }
    const state = await tx.estadoSolicitud.findUniqueOrThrow({ where: { nombre: 'Pendiente' } });
    return repository.createSolicitud({ ...data, apellido1: data.apellido1 ?? null, apellido2: data.apellido2 ?? null, telefono: data.telefono ?? null, ...identity, id_estado_solicitud: state.id_estado_solicitud }, tx);
  });
}
export async function getOwnSolicitud(identity: RegistrationIdentity) {
  const row = await repository.findSolicitud(identity);
  if (!row) throw new AppError('Solicitud no encontrada', 404, 'APPLICATION_NOT_FOUND');
  return { id_solicitud: row.id_solicitud, estado: row.EstadoSolicitud.nombre, fechaSolicitud: row.fechaSolicitud, fechaResolucion: row.fechaResolucion, motivoRechazo: row.motivoRechazo };
}
export async function resolveApplication(id: number, adminId: number, input: ResolveSolicitudDto) {
  return prisma.$transaction(async tx => {
    const admin = await tx.usuario.findUnique({ where: { id_usuario: adminId }, include: { RolUsuario: true, EstadoUsuario: true } });
    if (!admin || admin.RolUsuario.nombre_rol !== 'Administrador' || !admin.EstadoUsuario.permiteLogin) throw new AppError('No autorizado para resolver solicitudes', 403, 'FORBIDDEN');
    await repository.lockSolicitud(id, tx);
    const row = await repository.getSolicitud(id, tx);
    if (!row) throw new AppError('Solicitud no encontrada', 404, 'APPLICATION_NOT_FOUND');
    if (row.EstadoSolicitud.nombre !== 'Pendiente') throw new AppError('Solicitud ya resuelta', 409, 'APPLICATION_ALREADY_RESOLVED');
    const state = await tx.estadoSolicitud.findUniqueOrThrow({ where: { nombre: input.decision === 'Aceptar' ? 'Aceptada' : 'Rechazada' } });
    let userId: number | null = null;
    if (input.decision === 'Aceptar') {
      if (await tx.usuario.findFirst({ where: { OR: [{ email: row.email }, { numeroDocumento: row.numeroDocumento }] } }) ||
          await tx.cuentaAutenticacion.findFirst({ where: { proveedor: row.proveedor, external_id: row.external_id } })) {
        throw new AppError('Email, documento o identidad ya registrados', 409, 'APPLICATION_IDENTITY_CONFLICT');
      }
      const role = await tx.rolUsuario.findUnique({ where: { id_rol: 1 } });
      const status = await tx.estadoUsuario.findUnique({ where: { id_estado_usuario: 1 } });
      if (role?.nombre_rol !== 'Usuario' || status?.nombre_estado !== 'Activo' || !status.permiteLogin) throw new AppError('Catálogos de alta no válidos', 500, 'APPLICATION_CATALOG_INVALID');
      const user = await createUser({
        id_tipo_documento: row.id_tipo_documento, numeroDocumento: row.numeroDocumento,
        nombre: row.nombre, email: row.email, socio: row.socio,
        id_rol: 1, id_estado_usuario: 1, matriculaPagada: false,
        ...(row.apellido1 !== null && { apellido1: row.apellido1 }),
        ...(row.apellido2 !== null && { apellido2: row.apellido2 }),
        ...(row.telefono !== null && { telefono: row.telefono }),
      }, tx);
      userId = user.id_usuario;
      await createOAuthAccount({ id_usuario: userId, proveedor: row.proveedor, external_id: row.external_id, email: row.email }, tx);
    }
    return repository.resolveSolicitud(id, {
      id_estado_solicitud: state.id_estado_solicitud, fechaResolucion: new Date(),
      id_administrador_resolucion: adminId, id_usuario_creado: userId,
      motivoRechazo: input.decision === 'Rechazar' ? input.motivo : null,
    }, tx);
  });
}
