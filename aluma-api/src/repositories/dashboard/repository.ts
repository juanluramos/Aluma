import { prisma } from "../../config/prisma.js";

export async function getDashboardSummary() {
  const [
    usuarios,
    usuariosActivos,
    actividadesActivas,
    inscripciones,
  ] = await Promise.all([
    prisma.usuario.count(),

    prisma.usuario.count({
      where: {
        id_estado_usuario: 1,
      },
    }),

    prisma.actividad.count({
      where: {
        id_estado_actividad: 1,
      },
    }),

    prisma.inscripcionActividad.count(),
  ]);

  return {
    usuarios,
    usuariosActivos,
    actividadesActivas,
    inscripciones,
  };
}

export async function getUpcomingActivities() {
  const activities = await prisma.actividad.findMany({
    where: {
      fecha: {
        gte: new Date(),
      },
      id_estado_actividad: 1,
    },
    orderBy: {
      fecha: "asc",
    },
    take: 4,
    select: {
      id_actividad: true,
      titulo: true,
      fecha: true,
      aforo: true,
      InscripcionActividad: {
        select: {
          id_inscripcion: true,
        },
      },
    },
  });

  return activities.map((activity) => ({
    id: activity.id_actividad,
    titulo: activity.titulo,
    fecha: activity.fecha,
    aforo: activity.aforo,
    inscritos: activity.InscripcionActividad.length,
  }));
}

export async function getAnnualAttendance() {
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;

  const startPreviousYear = new Date(`${previousYear}-01-01T00:00:00`);
  const startNextYear = new Date(`${currentYear + 1}-01-01T00:00:00`);

  const registrations = await prisma.inscripcionActividad.findMany({
    where: {
      apuntadoFecha: {
        gte: startPreviousYear,
        lt: startNextYear,
      },
    },
    select: {
      apuntadoFecha: true,
    },
  });

  const months = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];

  const result = months.map((month) => ({
    month,
    actual: 0,
    anterior: 0,
  }));

  for (const registration of registrations) {
  const date = new Date(registration.apuntadoFecha);

  const year = date.getFullYear();
  const month = date.getMonth();

  const item = result[month];

  if (!item) {
    continue;
  }

  if (year === currentYear) {
    item.actual++;
  }

  if (year === previousYear) {
    item.anterior++;
  }
}

  return result;
}

export async function getPaymentStatus() {
  const estados = await prisma.estadoPago.findMany({
    select: {
      nombre_estado: true,
      _count: {
        select: {
          InscripcionActividad: true,
        },
      },
    },
    orderBy: {
      id_estado_pago: "asc",
    },
  });

  return estados.map((estado) => ({
    name: estado.nombre_estado,
    value: estado._count.InscripcionActividad,
  }));
}



