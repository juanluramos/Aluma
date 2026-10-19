import { z } from "zod";

// La promoción no acepta datos: el estado, el precio y la actividad los decide el servidor.
export const activateEnrollmentSchema = z.strictObject({}).optional().default({});
