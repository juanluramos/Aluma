import bcrypt from "bcryptjs";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import type { RegistroDto } from "../../dtos/auth/registro.dto.js";
import { AppError } from "../../errors/app-error.js";
import { createLocalAccount } from "../../repositories/auth/repository.js";
import { createUser } from "../../repositories/usuario/repository.js";
import { createAudit } from "../auditoria/service.js";

/**
 * Crea la cuenta de quien se registra en el login.
 * El estado siempre es Pendiente y no permite iniciar sesión.
 */
export async function registrarDesdeLogin(data: RegistroDto, requestId: string) {
  const [estado, rol] = await Promise.all([
    prisma.estadoUsuario.findUnique({ where: { nombre_estado: "Pendiente" } }),
    prisma.rolUsuario.findUnique({ where: { nombre_rol: "Usuario" } }),
  ]);

  if (!estado || estado.permiteLogin) {
    throw new AppError(
      "El estado Pendiente no está disponible.",
      500,
      "ESTADO_PENDIENTE_NO_DISPONIBLE",
    );
  }

  if (!rol) {
    throw new AppError("El rol Usuario no está disponible.", 500, "ROL_USUARIO_NO_DISPONIBLE");
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  try {
    await prisma.$transaction(async (tx) => {
      const created = await createUser({
        id_tipo_documento: data.id_tipo_documento,
        numeroDocumento: data.numeroDocumento,
        nombre: data.nombre,
        apellido1: data.apellido1,
        email: data.email,
        id_rol: rol.id_rol,
        socio: false,
        id_estado_usuario: estado.id_estado_usuario,
        matriculaPagada: false,
      }, tx);

      await createLocalAccount({
        id_usuario: created.id_usuario,
        email: data.email,
        password_hash: passwordHash,
      }, tx);

      await createAudit({
        requestId,
        id_usuario: created.id_usuario,
        rol_actor: "Usuario",
        accion: "USUARIO_CREADO",
        recurso: "USUARIO",
        id_recurso: created.id_usuario,
        resultado: "REALIZADA",
        codigo_error: null,
        detalles: { origen: "login" },
      }, tx);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const destino = JSON.stringify(error.meta?.target ?? "");
      if (destino.includes("email")) {
        throw new AppError("Ya existe una cuenta con ese correo.", 409, "EMAIL_DUPLICADO");
      }
      if (destino.toLowerCase().includes("documento")) {
        throw new AppError("Ya existe una cuenta con ese documento.", 409, "DOCUMENTO_DUPLICADO");
      }
      throw new AppError("Ya existe un registro con esos datos", 409, "DUPLICATE_RESOURCE");
    }
    throw error;
  }
}
