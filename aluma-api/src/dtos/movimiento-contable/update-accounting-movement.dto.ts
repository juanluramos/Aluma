import { z } from "zod";

export const updateAccountingMovementSchema = z
  .object({
    id_tipo_movimiento: z.number().int().positive().max(2147483647).optional(),

    concepto: z.string().trim().min(1).max(25).optional(),

    importe: z.number().min(-99999999.99).max(99999999.99).multipleOf(0.01).optional(),

    fecha: z.union([z.string().min(1), z.date()]).pipe(z.coerce.date()).optional(),

    id_inscripcion: z.number().int().positive().max(2147483647).nullable().optional(),

    comentario: z.string().trim().nullable().optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    {
      message: "Debe indicarse al menos un campo para actualizar",
    }
  );

export type UpdateAccountingMovementDto =
  z.infer<typeof updateAccountingMovementSchema>;