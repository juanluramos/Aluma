import { prisma } from "../../config/prisma.js";
import { inicioDeHoy } from "../../services/dashboard/presentacion.js";

async function idPorNombre(
  modelo: "estadoUsuario" | "estadoActividad",
  nombre: string,
): Promise<number | null> {
  if (modelo === "estadoUsuario") {
    const estado = await prisma.estadoUsuario.findUnique({
      where: { nombre_estado: nombre },
      select: { id_estado_usuario: true },
    });
    return estado?.id_estado_usuario ?? null;
  }
  const estado = await prisma.estadoActividad.findUnique({
    where: { nombre_estado: nombre },
    select: { id_estado_actividad: true },
  });
  return estado?.id_estado_actividad ?? null;
}

export async function getDashboardSummary() {
  const [usuarios, idUsuarioActivo, idActividadActiva, inscripciones] = await Promise.all([
    prisma.usuario.count(),
    idPorNombre("estadoUsuario", "Activo"),
    idPorNombre("estadoActividad", "Activo"),
    prisma.inscripcionActividad.count(),
  ]);
  const [usuariosActivos, actividadesActivas] = await Promise.all([
    idUsuarioActivo === null
      ? Promise.resolve(0)
      : prisma.usuario.count({ where: { id_estado_usuario: idUsuarioActivo } }),
    idActividadActiva === null
      ? Promise.resolve(0)
      : prisma.actividad.count({ where: { id_estado_actividad: idActividadActiva } }),
  ]);

  return {
    usuarios,
    usuariosActivos,
    actividadesActivas,
    inscripciones,
  };
}

export async function getUpcomingActivities() {
  return prisma.actividad.findMany({
    where: {
      fecha: { gte: inicioDeHoy() },
      EstadoActividad: { nombre_estado: "Activo" },
    },
    orderBy: { fecha: "asc" },
    take: 4,
    select: {
      id_actividad: true,
      titulo: true,
      fecha: true,
      aforo: true,
    },
  });
}

export async function getAnnualAttendanceDates(): Promise<Date[]> {
  const anioActual = new Date().getUTCFullYear();
  const inscripciones = await prisma.inscripcionActividad.findMany({
    where: {
      Actividad: {
        fecha: {
          gte: new Date(Date.UTC(anioActual - 1, 0, 1)),
          lt: new Date(Date.UTC(anioActual + 1, 0, 1)),
        },
      },
    },
    select: { Actividad: { select: { fecha: true } } },
  });
  return inscripciones.flatMap((inscripcion) => (
    inscripcion.Actividad.fecha ? [inscripcion.Actividad.fecha] : []
  ));
}

export async function getPaymentStatus() {
  const estados = await prisma.estadoPago.findMany({
    select: {
      nombre_estado: true,
      _count: { select: { InscripcionActividad: true } },
    },
    orderBy: { id_estado_pago: "asc" },
  });

  return estados.map((estado) => ({
    name: estado.nombre_estado,
    value: estado._count.InscripcionActividad,
  }));
}
