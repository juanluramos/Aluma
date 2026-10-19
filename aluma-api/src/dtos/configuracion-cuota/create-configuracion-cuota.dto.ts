import { z } from "zod";
import {
  anioConfiguracionCuotaSchema,
  importeConfiguracionCuotaSchema,
} from "../../utils/validacionesConfiguracionCuota.js";

/**
 * Alta de la configuración anual.
 * anio e importe son obligatorios. importe queda como texto "0.00".
 */
export const createConfiguracionCuotaSchema = z.object({
  anio: anioConfiguracionCuotaSchema,
  importe: importeConfiguracionCuotaSchema,
});

export type CreateConfiguracionCuotaDto = z.infer<typeof createConfiguracionCuotaSchema>;
