import { z } from "zod";
import { esFechaCalendario } from "./fechaCalendario.js";

/**
 * Años de cuota aceptados.
 * 1970 cubre registros históricos de la asociación.
 * 2100 deja margen para años próximos sin admitir valores absurdos.
 */
export const PAGO_ANIO_MINIMO = 1970;
export const PAGO_ANIO_MAXIMO = 2100;

const mensajeAnio = `El año de la cuota debe ser un entero entre ${PAGO_ANIO_MINIMO} y ${PAGO_ANIO_MAXIMO}.`;
const mensajeFecha = "La fecha de pago no es válida.";
const mensajeComentario = "El comentario no puede superar los 500 caracteres.";
const mensajeControl = "El comentario contiene caracteres no permitidos.";

/** Controles no imprimibles. Se conservan tabulación y saltos de línea. */
const CONTROLES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export const pagoAnioSchema = z.number({ error: mensajeAnio })
  .int(mensajeAnio)
  .min(PAGO_ANIO_MINIMO, mensajeAnio)
  .max(PAGO_ANIO_MAXIMO, mensajeAnio);

export const fechaPagoCuotaSchema = z.string({ error: mensajeFecha })
  .trim()
  .refine(esFechaCalendario, mensajeFecha);

export const comentarioCuotaSchema = z.string({ error: mensajeControl })
  .refine((valor) => !CONTROLES.test(valor), mensajeControl)
  .pipe(
    z.string().trim().max(500, mensajeComentario).transform((valor) => valor === "" ? null : valor),
  )
  .nullable()
  .optional();
