import { prisma } from "../../config/prisma.js";
import { filtroPlazasOcupadas, type ConteoActividad } from "../../services/actividad/ocupacion.js";

async function idEstadoInscripcion(nombre: string): Promise<number | null> {
  const estado = await prisma.estadoInscripcion.findUnique({
    where: { nombre },
    select: { id_estado_inscripcion: true },
  });
  return estado?.id_estado_inscripcion ?? null;
}

async function idEstadoPago(nombre: string): Promise<number | null> {
  const estado = await prisma.estadoPago.findUnique({
    where: { nombre_estado: nombre },
    select: { id_estado_pago: true },
  });
  return estado?.id_estado_pago ?? null;
}

function conteo(filas: { id_actividad: number; _count: { id_inscripcion: number } }[]): ConteoActividad[] {
  return filas.map((fila) => ({ id_actividad: fila.id_actividad, total: fila._count.id_inscripcion }));
}

export async function filtroOcupacionVigente() {
  const [activaId, pendienteId, pagadoId] = await Promise.all([
    idEstadoInscripcion("Activa"),
    idEstadoPago("Pendiente"),
    idEstadoPago("Pagado"),
  ]);
  return filtroPlazasOcupadas(activaId, pendienteId, pagadoId);
}

export async function contarOcupacionPorActividad(): Promise<{
  ocupadas: ConteoActividad[];
  espera: ConteoActividad[];
}> {
  const [esperaId, ocupadasWhere] = await Promise.all([
    idEstadoInscripcion("En espera"),
    filtroOcupacionVigente(),
  ]);
  const [ocupadas, espera] = await Promise.all([
    ocupadasWhere
      ? prisma.inscripcionActividad.groupBy({
        by: ["id_actividad"],
        where: ocupadasWhere,
        _count: { id_inscripcion: true },
      })
      : Promise.resolve([]),
    esperaId === null
      ? Promise.resolve([])
      : prisma.inscripcionActividad.groupBy({
        by: ["id_actividad"],
        where: { id_estado_inscripcion: esperaId },
        _count: { id_inscripcion: true },
      }),
  ]);
  return { ocupadas: conteo(ocupadas), espera: conteo(espera) };
}
