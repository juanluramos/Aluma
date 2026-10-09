import type { Request, Response } from "express";
import { getDashboardSummaryService, 
  getUpcomingActivitiesService,
  getAnnualAttendanceService,
  getPaymentStatusService,
} from "../../services/dashboard/service.js";

export async function getDashboardSummaryController(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const summary = await getDashboardSummaryService();

    res.status(200).json(summary);
  } catch (error) {
    console.error("Error al obtener el resumen del dashboard:", error);

    res.status(500).json({
      message: "Error interno del servidor",
    });
  }
}

export async function getUpcomingActivitiesController(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const activities = await getUpcomingActivitiesService();

    res.status(200).json(activities);
  } catch (error) {
    console.error(
      "Error al obtener próximas actividades:",
      error
    );

    res.status(500).json({
      message: "Error interno del servidor",
    });
  }
}

export async function getAnnualAttendanceController(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const attendance = await getAnnualAttendanceService();

    res.status(200).json(attendance);
  } catch (error) {
    console.error(
      "Error al obtener la asistencia anual:",
      error
    );

    res.status(500).json({
      message: "Error interno del servidor",
    });
  }
}

export async function getPaymentStatusController(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const paymentStatus = await getPaymentStatusService();

    res.status(200).json(paymentStatus);
  } catch (error) {
    console.error(
      "Error al obtener el estado de pagos:",
      error
    );

    res.status(500).json({
      message: "Error interno del servidor",
    });
  }
}
