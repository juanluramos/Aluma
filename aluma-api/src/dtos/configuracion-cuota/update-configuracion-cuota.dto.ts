import { z } from "zod";
import {
  anioConfiguracionCuotaSchema,
  importeConfiguracionCuotaSchema,
} from "../../utils/validacionesConfiguracionCuota.js";

/**
 * Actualización parcial. Los campos ausentes no se modifican.
 */
export const updateConfiguracionCuotaSchema = z.object({
  anio: anioConfiguracionCuotaSchema.optional(),
  importe: importeConfiguracionCuotaSchema.optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "Debe indicarse al menos un campo para actualizar" },
);

export type UpdateConfiguracionCuotaDto = z.infer<typeof updateConfiguracionCuotaSchema>;
