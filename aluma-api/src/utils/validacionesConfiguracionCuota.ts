import { z } from "zod";
import { pagoAnioSchema } from "./validacionesCuota.js";

/**
 * Importe oficial de la cuota de un año.
 * Se normaliza a texto con dos decimales, la misma forma que el resto de importes.
 * El máximo coincide con Decimal(10, 2).
 */
export const IMPORTE_CUOTA_MAXIMO = 99999999.99;

const mensajeImporte = "El importe debe ser mayor que 0, con un máximo de 2 decimales y hasta 99999999.99.";

export const importeConfiguracionCuotaSchema = z.number({ error: mensajeImporte })
  .refine((valor) => Number.isFinite(valor), mensajeImporte)
  .gt(0, mensajeImporte)
  .max(IMPORTE_CUOTA_MAXIMO, mensajeImporte)
  .multipleOf(0.01, mensajeImporte)
  .transform((valor) => valor.toFixed(2));

export const anioConfiguracionCuotaSchema = pagoAnioSchema;
