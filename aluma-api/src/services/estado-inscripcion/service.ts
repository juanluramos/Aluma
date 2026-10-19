import { getAllEnrollmentStatuses } from "../../repositories/estado-inscripcion/repository.js";

export async function getEnrollmentStatuses() {
  return getAllEnrollmentStatuses();
}
