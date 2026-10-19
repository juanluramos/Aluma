import { z } from "zod";
import {
  comentarioCuotaSchema,
  fechaPagoCuotaSchema,
  pagoAnioSchema,
} from "../../utils/validacionesCuota.js";

/**
 * Actualización parcial. Los campos ausentes no se modifican.
 */
export const updateCuotaSchema = z.object({
  id_usuario: z.number().int().positive().max(2147483647).optional(),
  pagoAnio: pagoAnioSchema.optional(),
  fechaPago: fechaPagoCuotaSchema.optional(),
  comentario: comentarioCuotaSchema,
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "Debe indicarse al menos un campo para actualizar" },
);

export type UpdateCuotaDto = z.infer<typeof updateCuotaSchema>;
