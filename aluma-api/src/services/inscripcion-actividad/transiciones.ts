// El orden de la lista de espera es createAt e id_inscripcion.
// Estos campos no forman parte del contrato de actualización.
export const CAMPOS_BLOQUEADOS_EN_COBRO = [
  'id_usuario',
  'id_actividad',
  'id_estado_inscripcion',
  'apuntadoFecha',
] as const;

export function ocupaPlaza(estadoInscripcion: string, estadoPago: string): boolean {
  return estadoInscripcion === 'Activa' && (estadoPago === 'Pendiente' || estadoPago === 'Pagado');
}

export function transicionInscripcionPermitida(actual: string, solicitado: string): boolean {
  if (actual === solicitado) return true;
  return solicitado === 'Cerrada' && (actual === 'Activa' || actual === 'En espera');
}

export function cancelaInscripcionAbierta(pagoActual: string, pagoNuevo: string, estadoActual: string): boolean {
  return pagoNuevo === 'Cancelado'
    && pagoActual !== 'Cancelado'
    && (estadoActual === 'Activa' || estadoActual === 'En espera');
}

export function reactivaInscripcionCancelada(pagoActual: string, pagoNuevo: string): boolean {
  return pagoActual === 'Cancelado' && pagoNuevo !== 'Cancelado';
}
