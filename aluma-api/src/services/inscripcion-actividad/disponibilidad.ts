import { readEnrollmentAvailability } from '../../repositories/inscripcion-actividad/disponibilidad.js';

export interface DisponibilidadInscripcion {
  posicionEspera: number | null;
  plazasOcupadas: number;
  plazasDisponibles: number | null;
  aforo: number | null;
  puedePromocionar: boolean;
}

type FilaDisponibilidad = {
  id_inscripcion: number;
  id_actividad: number;
  id_estado_inscripcion: number;
  id_estado_pago: number;
};

// El indicador es informativo. El PATCH vuelve a comprobar turno, pago y plaza.
export async function adjuntarDisponibilidad<T extends FilaDisponibilidad>(filas: T[]): Promise<Array<T & DisponibilidadInscripcion>> {
  const actividades = [...new Set(filas.map((fila) => fila.id_actividad))];
  const datos = await readEnrollmentAvailability(actividades);
  const aforoPorActividad = new Map(datos.aforos.map((actividad) => [actividad.id_actividad, actividad.aforo]));
  const ocupadasPorActividad = new Map<number, number>();
  for (const fila of datos.ocupadas) {
    ocupadasPorActividad.set(fila.id_actividad, (ocupadasPorActividad.get(fila.id_actividad) ?? 0) + 1);
  }
  const posicionPorInscripcion = new Map<number, number>();
  const ordenPorActividad = new Map<number, number>();
  for (const fila of datos.cola) {
    const posicion = (ordenPorActividad.get(fila.id_actividad) ?? 0) + 1;
    ordenPorActividad.set(fila.id_actividad, posicion);
    posicionPorInscripcion.set(fila.id_inscripcion, posicion);
  }
  const conteoFiable = datos.activaId !== null && datos.pendienteId !== null && datos.pagadoId !== null;

  return filas.map((fila) => {
    const conocida = aforoPorActividad.has(fila.id_actividad);
    const aforo = conocida ? aforoPorActividad.get(fila.id_actividad) ?? null : null;
    const plazasOcupadas = ocupadasPorActividad.get(fila.id_actividad) ?? 0;
    const enEspera = datos.esperaId !== null && fila.id_estado_inscripcion === datos.esperaId;
    const posicionEspera = enEspera ? posicionPorInscripcion.get(fila.id_inscripcion) ?? null : null;
    const plazasDisponibles = !conocida || aforo === null ? null : Math.max(0, aforo - plazasOcupadas);
    const hayPlaza = conocida && (aforo === null || plazasOcupadas < aforo);
    const pagoPendiente = datos.pendienteId !== null && fila.id_estado_pago === datos.pendienteId;
    return {
      ...fila,
      posicionEspera,
      plazasOcupadas,
      plazasDisponibles,
      aforo,
      puedePromocionar: conteoFiable && enEspera && pagoPendiente && posicionEspera === 1 && hayPlaza,
    };
  });
}
