import { prisma } from "../../config/prisma.js";
/**
 * Busca una cuenta de autenticación local por email
 * incluyendo el usuario, su estado y su rol.
 */
export async function findLocalAccountByEmail(email) {
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
/**
 * Busca una cuenta de autenticación OAuth
 * mediante el proveedor y el identificador externo.
 */
export async function findOAuthAccount(proveedor, externalId) {
    return prisma.cuentaAutenticacion.findFirst({
        where: {
            proveedor,
            external_id: externalId,
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
/**
 * Crea una cuenta de autenticación OAuth.
 *
 * @param data - Datos de la cuenta OAuth.
 * @param client - Cliente Prisma, permitiendo usar transacciones.
 */
export async function createOAuthAccount(data, client = prisma) {
    return client.cuentaAutenticacion.create({
        data: {
            id_usuario: data.id_usuario,
            proveedor: data.proveedor,
            email: data.email,
            external_id: data.external_id,
            password_hash: null,
        },
    });
}
//# sourceMappingURL=repository.js.map