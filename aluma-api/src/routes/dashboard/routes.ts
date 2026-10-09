import { Router } from "express";

import {
  getDashboardSummaryController,
  getUpcomingActivitiesController,
  getAnnualAttendanceController,
  getPaymentStatusController,
} from "../../controllers/dashboard/controller.js";

import { authenticate } from "../../middlewares/auth/authenticate.middleware.js";

const router = Router();
router.use(authenticate);

router.get("/resumen", getDashboardSummaryController);

router.get(
  "/proximas-actividades",
  getUpcomingActivitiesController
);

router.get(
  "/asistencia-anual",
  getAnnualAttendanceController
);

router.get(
  "/estado-pagos",
  getPaymentStatusController
);

export default router;