import { 
  getDashboardSummary, 
  getUpcomingActivities, 
  getAnnualAttendance,
  getPaymentStatus, 
} from "../../repositories/dashboard/repository.js";



export async function getDashboardSummaryService() {
  return await getDashboardSummary();
}

export async function getUpcomingActivitiesService() {
  return getUpcomingActivities();
}

export async function getAnnualAttendanceService() {
  return getAnnualAttendance();
}

export async function getPaymentStatusService() {
  return getPaymentStatus();
}

