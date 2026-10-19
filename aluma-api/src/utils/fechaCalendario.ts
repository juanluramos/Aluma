/** Día de calendario YYYY-MM-DD, sin hora y sin desplazamiento de zona. */

const CALENDARIO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function fechaHoyCalendario(ahora = new Date()): string {
  const ano = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function esFechaCalendario(valor: string): boolean {
  const coincidencia = CALENDARIO.exec(valor);
  if (!coincidencia) return false;
  const ano = Number(coincidencia[1]);
  const mes = Number(coincidencia[2]);
  const dia = Number(coincidencia[3]);
  const fecha = new Date(Date.UTC(ano, mes - 1, dia));
  return fecha.getUTCFullYear() === ano
    && fecha.getUTCMonth() === mes - 1
    && fecha.getUTCDate() === dia;
}

/** Medianoche UTC del día indicado. El adaptador MariaDB escribe la fecha con componentes UTC. */
export function fechaDesdeCalendario(valor: string): Date {
  return new Date(`${valor}T00:00:00.000Z`);
}

export function textoFechaCalendario(valor: Date | string): string {
  if (typeof valor === 'string') {
    const coincidencia = /^(\d{4}-\d{2}-\d{2})/.exec(valor.trim());
    if (coincidencia) return coincidencia[1]!;
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return valor;
    valor = fecha;
  }
  const ano = valor.getUTCFullYear();
  const mes = String(valor.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(valor.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function fechaInscripcionAlCrear(valor: string | undefined, hoy = fechaHoyCalendario()): Date {
  return fechaDesdeCalendario(valor ?? hoy);
}

/** `undefined` conserva la fecha ya guardada. */
export function fechaInscripcionAlActualizar(valor: string | undefined): Date | undefined {
  return valor === undefined ? undefined : fechaDesdeCalendario(valor);
}

export function conFechaInscripcion<T extends { fechaInscripcion: Date | string }>(usuario: T): Omit<T, 'fechaInscripcion'> & { fechaInscripcion: string } {
  return { ...usuario, fechaInscripcion: textoFechaCalendario(usuario.fechaInscripcion) };
}
