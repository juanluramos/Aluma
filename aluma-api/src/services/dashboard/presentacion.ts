import { resumirOcupacion, type ConteoActividad } from "../actividad/ocupacion.js";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"] as const;

export type ActividadProxima = {
  id_actividad: number;
  titulo: string;
  fecha: Date;
  aforo: number | null;
};

export type ProximaPresentada = {
  id: number;
  titulo: string;
  fecha: Date;
  aforo: number | null;
  plazasOcupadas: number;
  plazasDisponibles: number | null;
  personasEnEspera: number;
};

export function inicioDeHoy(ahora = new Date()): Date {
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
}

export function presentarProximas(
  actividades: readonly ActividadProxima[],
  ocupadas: readonly ConteoActividad[],
  espera: readonly ConteoActividad[],
): ProximaPresentada[] {
  return resumirOcupacion(actividades, ocupadas, espera).map((actividad) => ({
    id: actividad.id_actividad,
    titulo: actividad.titulo,
    fecha: actividad.fecha,
    aforo: actividad.aforo,
    plazasOcupadas: actividad.plazasOcupadas,
    plazasDisponibles: actividad.plazasDisponibles,
    personasEnEspera: actividad.personasEnEspera,
  }));
}

export function presentarAsistencia(fechas: readonly Date[], ahora = new Date()) {
  const anioActual = ahora.getUTCFullYear();
  const anioAnterior = anioActual - 1;
  const meses = MESES.map((month) => ({ month, actual: 0, anterior: 0 }));
  for (const fecha of fechas) {
    const anio = fecha.getUTCFullYear();
    const mes = meses[fecha.getUTCMonth()];
    if (!mes) continue;
    if (anio === anioActual) mes.actual += 1;
    else if (anio === anioAnterior) mes.anterior += 1;
  }
  return { anioActual, anioAnterior, meses };
}
