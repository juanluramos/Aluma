import { getDashboardSummaryService, getUpcomingActivitiesService, getAnnualAttendanceService, getPaymentStatusService, } from "../../services/dashboard/service.js";
export async function getDashboardSummaryController(_req, res) {
    try {
        const summary = await getDashboardSummaryService();
        res.status(200).json(summary);
    }
    catch (error) {
        console.error("Error al obtener el resumen del dashboard:", error);
        res.status(500).json({
            message: "Error interno del servidor",
        });
    }
}
export async function getUpcomingActivitiesController(_req, res) {
    try {
        const activities = await getUpcomingActivitiesService();
        res.status(200).json(activities);
    }
    catch (error) {
        console.error("Error al obtener próximas actividades:", error);
        res.status(500).json({
            message: "Error interno del servidor",
        });
    }
}
export async function getAnnualAttendanceController(_req, res) {
    try {
        const attendance = await getAnnualAttendanceService();
        res.status(200).json(attendance);
    }
    catch (error) {
        console.error("Error al obtener la asistencia anual:", error);
        res.status(500).json({
            message: "Error interno del servidor",
        });
    }
}
export async function getPaymentStatusController(_req, res) {
    try {
        const paymentStatus = await getPaymentStatusService();
        res.status(200).json(paymentStatus);
    }
    catch (error) {
        console.error("Error al obtener el estado de pagos:", error);
        res.status(500).json({
            message: "Error interno del servidor",
        });
    }
}
//# sourceMappingURL=controller.js.map