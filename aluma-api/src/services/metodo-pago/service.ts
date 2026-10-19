import { getAllPaymentMethods } from "../../repositories/metodo-pago/repository.js";

export async function getPaymentMethods() {
  return getAllPaymentMethods();
}
