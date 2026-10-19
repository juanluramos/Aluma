import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../errors/app-error.js';

export function precioAplicadoDeTarifa(
  socio: boolean,
  tarifas: { importeSocio: Prisma.Decimal | null; importeNoSocio: Prisma.Decimal | null },
): Prisma.Decimal {
  const tarifa = socio ? tarifas.importeSocio : tarifas.importeNoSocio;
  if (tarifa === null) {
    throw new AppError(
      socio ? 'La actividad no tiene tarifa de socio' : 'La actividad no tiene tarifa de no socio',
      400,
      'ENROLLMENT_PRICE_UNDEFINED',
    );
  }
  return tarifa;
}
