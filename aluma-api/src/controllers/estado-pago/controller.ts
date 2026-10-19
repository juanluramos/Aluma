import type { NextFunction, Request, Response } from "express";
import { getPaymentStatuses } from "../../services/estado-pago/service.js";

export async function getPaymentStatusesController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.status(200).json(await getPaymentStatuses());
  } catch (error) {
    next(error);
  }
}
