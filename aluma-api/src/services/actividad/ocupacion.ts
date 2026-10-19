export type ConteoActividad = {
  id_actividad: number;
  total: number;
};

export function filtroPlazasOcupadas(
  activaId: number | null,
  pendienteId: number | null,
  pagadoId: number | null,
): { id_estado_inscripcion: number; id_estado_pago: { in: number[] } } | null {
  const pagos = [pendienteId, pagadoId].filter((id): id is number => id !== null);
  if (activaId === null || pagos.length === 0) return null;
  return { id_estado_inscripcion: activaId, id_estado_pago: { in: pagos } };
}

export function resumirOcupacion<T extends { id_actividad: number; aforo: number | null }>(
  actividades: readonly T[],
  ocupadas: readonly ConteoActividad[],
  espera: readonly ConteoActividad[],
): Array<T & { plazasOcupadas: number; plazasDisponibles: number | null; personasEnEspera: number }> {
  const ocupadasPorId = new Map(ocupadas.map((fila) => [fila.id_actividad, fila.total]));
  const esperaPorId = new Map(espera.map((fila) => [fila.id_actividad, fila.total]));
  return actividades.map((actividad) => {
    const plazasOcupadas = ocupadasPorId.get(actividad.id_actividad) ?? 0;
    return {
      ...actividad,
      plazasOcupadas,
      plazasDisponibles: actividad.aforo === null ? null : Math.max(0, actividad.aforo - plazasOcupadas),
      personasEnEspera: esperaPorId.get(actividad.id_actividad) ?? 0,
    };
  });
}
