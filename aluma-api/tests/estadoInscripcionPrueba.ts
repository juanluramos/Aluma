import { prisma } from '../src/config/prisma.js';
import type { Prisma } from '../src/generated/prisma/client.js';

type Cliente = Prisma.TransactionClient | typeof prisma;

export type EstadoEnEsperaDePrueba = {
  id: number;
  propio: false;
};

export async function prepararEstadoEnEspera(db: Cliente = prisma): Promise<EstadoEnEsperaDePrueba> {
  const previo = await db.estadoInscripcion.findUnique({ where: { nombre: 'En espera' } });
  if (!previo) {
    throw new Error('Falta el estado de inscripción «En espera». La prueba se detiene sin modificar el catálogo.');
  }
  return { id: previo.id_estado_inscripcion, propio: false };
}

export async function retirarEstadoEnEsperaDeLaPrueba(
  _estado?: EstadoEnEsperaDePrueba,
  _db?: Cliente,
): Promise<void> {
  return undefined;
}
