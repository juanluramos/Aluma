import type { NextFunction, Request, Response } from "express";
import { getPaymentMethods } from "../../services/metodo-pago/service.js";

export async function getPaymentMethodsController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.status(200).json(await getPaymentMethods());
  } catch (error) {
    next(error);
  }
}
