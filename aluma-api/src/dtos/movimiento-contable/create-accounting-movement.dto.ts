import { z } from "zod";

export const createAccountingMovementSchema = z.object({
  id_tipo_movimiento: z.number().int().positive(),

  concepto: z.string().trim().min(1).max(25),

  importe: z.number(),

  fecha: z.coerce.date(),

  id_inscripcion: z.number().int().positive().nullable().optional(),

  comentario: z.string().trim().nullable().optional(),
});

export type CreateAccountingMovementDto =
  z.infer<typeof createAccountingMovementSchema>;