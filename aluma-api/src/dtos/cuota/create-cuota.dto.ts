import { z } from "zod";
import {
  comentarioCuotaSchema,
  fechaPagoCuotaSchema,
  pagoAnioSchema,
} from "../../utils/validacionesCuota.js";

/**
 * Alta de una cuota anual.
 * Si no llega fechaPago, el repositorio no la envía y MariaDB usa CURDATE().
 */
export const createCuotaSchema = z.object({
  id_usuario: z.number().int().positive().max(2147483647),
  pagoAnio: pagoAnioSchema,
  fechaPago: fechaPagoCuotaSchema.optional(),
  comentario: comentarioCuotaSchema,
});

export type CreateCuotaDto = z.infer<typeof createCuotaSchema>;
