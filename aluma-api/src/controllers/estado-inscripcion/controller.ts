import type { NextFunction, Request, Response } from "express";
import { getEnrollmentStatuses } from "../../services/estado-inscripcion/service.js";

export async function getEnrollmentStatusesController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.status(200).json(await getEnrollmentStatuses());
  } catch (error) {
    next(error);
  }
}
