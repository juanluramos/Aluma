import { prisma } from '../../config/prisma.js';

export async function readEnrollmentAvailability(activityIds: number[]) {
  if (activityIds.length === 0) {
    return {
      activaId: null as number | null,
      esperaId: null as number | null,
      pendienteId: null as number | null,
      pagadoId: null as number | null,
      aforos: [] as Array<{ id_actividad: number; aforo: number | null }>,
      ocupadas: [] as Array<{ id_actividad: number }>,
      cola: [] as Array<{ id_inscripcion: number; id_actividad: number }>,
    };
  }

  const [activa, espera, pendiente, pagado] = await Promise.all([
    prisma.estadoInscripcion.findUnique({ where: { nombre: 'Activa' }, select: { id_estado_inscripcion: true } }),
    prisma.estadoInscripcion.findUnique({ where: { nombre: 'En espera' }, select: { id_estado_inscripcion: true } }),
    prisma.estadoPago.findUnique({ where: { nombre_estado: 'Pendiente' }, select: { id_estado_pago: true } }),
    prisma.estadoPago.findUnique({ where: { nombre_estado: 'Pagado' }, select: { id_estado_pago: true } }),
  ]);

  const aforos = await prisma.actividad.findMany({
    where: { id_actividad: { in: activityIds } },
    select: { id_actividad: true, aforo: true },
  });
  const ocupadas = activa && pendiente && pagado
    ? await prisma.inscripcionActividad.findMany({
      where: {
        id_actividad: { in: activityIds },
        id_estado_inscripcion: activa.id_estado_inscripcion,
        id_estado_pago: { in: [pendiente.id_estado_pago, pagado.id_estado_pago] },
      },
      select: { id_actividad: true },
    })
    : [];
  const cola = espera
    ? await prisma.inscripcionActividad.findMany({
      where: {
        id_actividad: { in: activityIds },
        id_estado_inscripcion: espera.id_estado_inscripcion,
      },
      select: { id_inscripcion: true, id_actividad: true },
      orderBy: [{ createAt: 'asc' }, { id_inscripcion: 'asc' }],
    })
    : [];

  return {
    activaId: activa?.id_estado_inscripcion ?? null,
    esperaId: espera?.id_estado_inscripcion ?? null,
    pendienteId: pendiente?.id_estado_pago ?? null,
    pagadoId: pagado?.id_estado_pago ?? null,
    aforos,
    ocupadas,
    cola,
  };
}
