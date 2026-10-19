import { getAllPaymentStatuses } from "../../repositories/estado-pago/repository.js";

export async function getPaymentStatuses() {
  return getAllPaymentStatuses();
}
