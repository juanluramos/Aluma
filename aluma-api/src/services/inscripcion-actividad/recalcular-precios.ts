import { Prisma } from '../../generated/prisma/client.js';
import type { EnrollmentTransaction } from '../../repositories/inscripcion-actividad/repository.js';
import {
  getActivityEnrollmentsForPricing,
  getUserEnrollmentsForPricing,
  updateAppliedPrice,
} from '../../repositories/inscripcion-actividad/repository.js';
import { createAudit } from '../auditoria/service.js';
import { precioAplicadoDeTarifa } from './precio-aplicado.js';

type Tarifas = Parameters<typeof precioAplicadoDeTarifa>[1];

export interface RecalculoPrecioContext {
  requestId: string;
  id_usuario: number;
  rol_actor: string;
}

type InscripcionCandidata = {
  id_inscripcion: number;
  precioAplicado: Prisma.Decimal | null;
  estadoInscripcion: string;
  estadoPago: string;
  socio: boolean;
  tarifas: Tarifas;
};

function inscripcionPendiente(estadoInscripcion: string, estadoPago: string): boolean {
  return estadoInscripcion === 'Activa' && estadoPago === 'Pendiente';
}

function cambiosDePrecio(inscripciones: InscripcionCandidata[]) {
  return inscripciones.flatMap((inscripcion) => {
    if (!inscripcionPendiente(inscripcion.estadoInscripcion, inscripcion.estadoPago)) return [];
    const tarifa = precioAplicadoDeTarifa(inscripcion.socio, inscripcion.tarifas);
    const anterior = inscripcion.precioAplicado?.toFixed(2) ?? null;
    if (anterior === tarifa.toFixed(2)) return [];
    return [{ id: inscripcion.id_inscripcion, anterior, tarifa }];
  });
}

async function guardarCambiosDePrecio(
  cambios: ReturnType<typeof cambiosDePrecio>,
  db: EnrollmentTransaction,
  context: RecalculoPrecioContext,
) {
  for (const cambio of cambios) {
    await updateAppliedPrice(cambio.id, cambio.tarifa, db);
    await createAudit({
      requestId: context.requestId,
      id_usuario: context.id_usuario,
      rol_actor: context.rol_actor,
      accion: 'INSCRIPCION_MODIFICADA',
      recurso: 'INSCRIPCION_ACTIVIDAD',
      id_recurso: cambio.id,
      resultado: 'REALIZADA',
      codigo_error: null,
      detalles: {
        cambios: {
          precioAplicado: { anterior: cambio.anterior, nuevo: cambio.tarifa.toFixed(2) },
        },
      },
    }, db);
  }
}

export async function recalcularPreciosPendientes(
  activityId: number,
  tarifas: Tarifas,
  db: EnrollmentTransaction,
  context: RecalculoPrecioContext,
): Promise<void> {
  const inscripciones = await getActivityEnrollmentsForPricing(activityId, db);
  await guardarCambiosDePrecio(cambiosDePrecio(inscripciones.map((inscripcion) => ({
    id_inscripcion: inscripcion.id_inscripcion,
    precioAplicado: inscripcion.precioAplicado,
    estadoInscripcion: inscripcion.EstadoInscripcion.nombre,
    estadoPago: inscripcion.EstadoPago.nombre_estado,
    socio: inscripcion.Usuario.socio,
    tarifas,
  }))), db, context);
}

export async function recalcularPreciosDeUsuario(
  userId: number,
  socio: boolean,
  db: EnrollmentTransaction,
  context: RecalculoPrecioContext,
): Promise<void> {
  const inscripciones = await getUserEnrollmentsForPricing(userId, db);
  await guardarCambiosDePrecio(cambiosDePrecio(inscripciones.map((inscripcion) => ({
    id_inscripcion: inscripcion.id_inscripcion,
    precioAplicado: inscripcion.precioAplicado,
    estadoInscripcion: inscripcion.EstadoInscripcion.nombre,
    estadoPago: inscripcion.EstadoPago.nombre_estado,
    socio,
    tarifas: inscripcion.Actividad,
  }))), db, context);
}
