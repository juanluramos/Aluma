import { prisma } from "../../config/prisma.js";

/**
 * Busca una cuenta de autenticación local por email
 * incluyendo el usuario, su estado y su rol.
 */
export async function findLocalAccountByEmail(email: string) {
  return prisma.cuentaAutenticacion.findFirst({
    where: {
      email,
      proveedor: "Local",
    },
    include: {
      Usuario: {
        include: {
          EstadoUsuario: true,
          RolUsuario: true,
        },
      },
    },
  });
}