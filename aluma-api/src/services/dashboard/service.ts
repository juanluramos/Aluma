import { contarOcupacionPorActividad } from "../../repositories/actividad/ocupacion.js";
import {
  getAnnualAttendanceDates,
  getDashboardSummary,
  getPaymentStatus,
  getUpcomingActivities,
} from "../../repositories/dashboard/repository.js";
import { presentarAsistencia, presentarProximas } from "./presentacion.js";

export async function getDashboardSummaryService() {
  return getDashboardSummary();
}

export async function getUpcomingActivitiesService() {
  const [actividades, conteos] = await Promise.all([
    getUpcomingActivities(),
    contarOcupacionPorActividad(),
  ]);
  const conFecha = actividades.flatMap((actividad) => (
    actividad.fecha ? [{ ...actividad, fecha: actividad.fecha }] : []
  ));
  return presentarProximas(conFecha, conteos.ocupadas, conteos.espera);
}

export async function getAnnualAttendanceService() {
  return presentarAsistencia(await getAnnualAttendanceDates());
}

export async function getPaymentStatusService() {
  return getPaymentStatus();
}
