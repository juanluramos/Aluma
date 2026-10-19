import bcrypt from "bcryptjs";
import { createLocalAccount } from "../../repositories/auth/repository.js";
import { textoFechaCalendario } from "../../utils/fechaCalendario.js";
import { documentoUsuarioSchema } from "../../utils/validacionesUsuario.js";
import {getAllUsers, getUserById, createUser, updateUser, deleteUser} from "../../repositories/usuario/repository.js";
import type {CreateUserDto} from "../../dtos/usuario/create-user.dto.js";
import type {UpdateUserDto} from "../../dtos/usuario/update-user.dto.js";
import { AppError } from "../../errors/app-error.js";
import { prisma } from "../../config/prisma.js";
import { createAudit } from "../auditoria/service.js";
import { recalcularPreciosDeUsuario } from "../inscripcion-actividad/recalcular-precios.js";
import { getIO } from "../../socket/socket.js";

export interface UserCreationAuditContext {
  requestId: string;
  id_usuario: number;
  rol_actor: string;
}

/**
 * Obtiene todos los usuarios.
 *
 * En esta capa se aplicarán las reglas de negocio
 * relacionadas con los usuarios.
 *
 * @returns Lista de usuarios.
 */

export async function getUsers() {
    return getAllUsers();
}

/**
 * Obtiene un usuario por su ID.
 *
 * @param id - El ID del usuario a buscar.
 * @returns El usuario encontrado o null si no existe.
 */

export async function getUser(id: number) {
    const user = await getUserById(id);

    if (!user) {
        throw new AppError("Usuario no encontrado", 404, "USER_NOT_FOUND");
    }
    return user;
}



/**
 * Crea un nuevo usuario.
 *
 * En esta capa se aplicarán las reglas de negocio
 * relacionadas con la creación de usuarios.
 * 
 * @param data - Datos del nuevo usuario.
 * @returns usuario creado.
 */

/** Solo Operador y Administrador reciben cuenta local. El rol Usuario queda sin acceso. */
export function rolConCuentaLocal(nombreRol: string): boolean {
  return nombreRol === "Operador" || nombreRol === "Administrador";
}

/** Una contraseña enviada al crear un Usuario no abre cuenta. */
export function passwordDeAlta(nombreRol: string, password: string | undefined): string | undefined {
  return rolConCuentaLocal(nombreRol) ? password : undefined;
}

/** La edición solo cambia la cuenta local de quien ya puede iniciar sesión. */
export function decisionPasswordEdicion(
  rolActor: string,
  nombreRolDestino: string,
  password: string | undefined,
): "aplicar" | "ignorar" | "prohibido" {
  if (!password || !rolConCuentaLocal(nombreRolDestino)) return "ignorar";
  if (rolActor === "Administrador") return "aplicar";
  if (rolActor === "Operador" && nombreRolDestino === "Operador") return "aplicar";
  return "prohibido";
}

export async function createNewUser(
  data: CreateUserDto,
  context: UserCreationAuditContext
) {
  const rol = await prisma.rolUsuario.findUnique({ where: { id_rol: data.id_rol } });
  if (!rol) {
    throw new AppError("El rol no es válido.", 400, "VALIDATION_ERROR");
  }
  if (rolConCuentaLocal(rol.nombre_rol) && !data.email) {
    throw new AppError(
      "El email es obligatorio para un operador o un administrador.",
      400,
      "VALIDATION_ERROR",
    );
  }
  const password = passwordDeAlta(rol.nombre_rol, data.password);
  if (rolConCuentaLocal(rol.nombre_rol) && password === undefined) {
    throw new AppError(
      "La contraseña es obligatoria para un operador o un administrador.",
      400,
      "VALIDATION_ERROR",
    );
  }
  const passwordHash = password === undefined ? undefined : await bcrypt.hash(password, 12);
  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await createUser(data, tx);
    if (passwordHash !== undefined) {
      if (!createdUser.email) {
        throw new AppError(
          "El email es obligatorio para un operador o un administrador.",
          400,
          "VALIDATION_ERROR",
        );
      }
      await createLocalAccount({
        id_usuario: createdUser.id_usuario,
        email: createdUser.email,
        password_hash: passwordHash,
      }, tx);
    }

    await createAudit(
      {
        requestId: context.requestId,
        id_usuario: context.id_usuario,
        rol_actor: context.rol_actor,
        accion: "USUARIO_CREADO",
        recurso: "USUARIO",
        id_recurso: createdUser.id_usuario,
        resultado: "REALIZADA",
        codigo_error: null,
        detalles: null,
      },
      tx
    );

    return createdUser;
  });

  getIO().emit("dashboard:update");

  return user;
}
/**
 * Actualiza un usuario existente.
 *
 * En esta capa se aplicarán las reglas de negocio
 * relacionadas con la actualización de usuarios.
 *
 * @param id - El ID del usuario a actualizar.
 * @param data - Datos a actualizar.
 * @returns El usuario actualizado.
 */
/**
 * Actualiza un usuario existente.
 *
 * Comprueba primero que el usuario exista.
 * Si no existe, se lanza un AppError antes de actualizar.
 *
 * @param id - El ID del usuario a actualizar.
 * @param data - Datos del usuario que se van a actualizar.
 * @returns El usuario actualizado.
 */
export async function updateExistingUser(
  id: number,
  data: UpdateUserDto,
  context: UserCreationAuditContext
) {
  const password = data.password || undefined;
  const passwordHash = password === undefined ? undefined : await bcrypt.hash(password, 12);
  const actualizado = await prisma.$transaction(
    async (tx) => {
      const anterior = await getUserById(id, tx);

      if (!anterior) {
        throw new AppError(
          "Usuario no encontrado",
          404,
          "USER_NOT_FOUND"
        );
      }

      if (data.id_tipo_documento !== undefined || data.numeroDocumento !== undefined) {
        const tipo = data.id_tipo_documento !== undefined ? data.id_tipo_documento : anterior.id_tipo_documento;
        const numero = data.numeroDocumento !== undefined ? data.numeroDocumento : anterior.numeroDocumento;
        if (!(tipo == null && numero == null)) {
          const documento = documentoUsuarioSchema.safeParse({
            id_tipo_documento: tipo,
            numeroDocumento: numero,
          });
          if (!documento.success) {
            throw new AppError(documento.error.issues[0]!.message, 400, "VALIDATION_ERROR");
          }
        }
      }

      const rolDestino = await tx.rolUsuario.findUnique({
        where: { id_rol: data.id_rol ?? anterior.id_rol },
      });
      const emailFinal = data.email !== undefined ? data.email : anterior.email;
      if (rolDestino && rolConCuentaLocal(rolDestino.nombre_rol) && !emailFinal) {
        throw new AppError(
          "El email es obligatorio para un operador o un administrador.",
          400,
          "VALIDATION_ERROR",
        );
      }

      const usuarioActualizado = await updateUser(id, data, tx);
      let passwordActualizada = false;
      if (passwordHash !== undefined && password !== undefined) {
        const rol = await tx.rolUsuario.findUnique({ where: { id_rol: usuarioActualizado.id_rol } });
        const decision = decisionPasswordEdicion(context.rol_actor, rol?.nombre_rol ?? "", password);
        if (decision === "prohibido") {
          throw new AppError("No tienes permisos para cambiar la contraseña", 403, "FORBIDDEN_FIELDS");
        }
        if (decision === "aplicar") {
          const local = await tx.cuentaAutenticacion.findFirst({
            where: { id_usuario: id, proveedor: "Local" },
          });
          if (!usuarioActualizado.email) {
            throw new AppError(
              "El email es obligatorio para un operador o un administrador.",
              400,
              "VALIDATION_ERROR",
            );
          }
          if (local) {
            await tx.cuentaAutenticacion.update({
              where: { id_cuenta: local.id_cuenta },
              data: { password_hash: passwordHash, email: usuarioActualizado.email },
            });
          } else {
            await createLocalAccount({
              id_usuario: usuarioActualizado.id_usuario,
              email: usuarioActualizado.email,
              password_hash: passwordHash,
            }, tx);
          }
          passwordActualizada = true;
        }
      } else if (usuarioActualizado.email && anterior.email !== usuarioActualizado.email) {
        await tx.cuentaAutenticacion.updateMany({
          where: { id_usuario: id, proveedor: "Local" },
          data: { email: usuarioActualizado.email },
        });
      }

      if (anterior.socio !== usuarioActualizado.socio) {
        await recalcularPreciosDeUsuario(
          usuarioActualizado.id_usuario,
          usuarioActualizado.socio,
          tx,
          context,
        );
      }

      const campos = [
        "codUsuario",
        "id_tipo_documento",
        "numeroDocumento",
        "nombre",
        "apellido1",
        "apellido2",
        "email",
        "telefono",
        "id_rol",
        "socio",
        "id_estado_usuario",
        "matriculaPagada",
        "comentario",
      ] as const satisfies readonly (keyof UpdateUserDto)[];

      const cambios: Record<
        string,
        {
          anterior: string | number | boolean | null;
          nuevo: string | number | boolean | null;
        }
      > = {};

      for (const campo of campos) {
        if (anterior[campo] !== usuarioActualizado[campo]) {
          cambios[campo] = {
            anterior: anterior[campo],
            nuevo: usuarioActualizado[campo],
          };
        }
      }

      const fechaAnterior = textoFechaCalendario(anterior.fechaInscripcion);
      const fechaNueva = textoFechaCalendario(usuarioActualizado.fechaInscripcion);
      if (fechaAnterior !== fechaNueva) {
        cambios.fechaInscripcion = { anterior: fechaAnterior, nuevo: fechaNueva };
      }

      if (Object.keys(cambios).length > 0 || passwordActualizada) {
        await createAudit(
          {
            requestId: context.requestId,
            id_usuario: context.id_usuario,
            rol_actor: context.rol_actor,
            accion: "USUARIO_MODIFICADO",
            recurso: "USUARIO",
            id_recurso: usuarioActualizado.id_usuario,
            resultado: "REALIZADA",
            codigo_error: null,
            detalles: {
              cambios,
              ...(passwordActualizada && { passwordActualizada: true }),
            },
          },
          tx
        );
      }

      return usuarioActualizado;
    },
    {
      isolationLevel: "Serializable",
    }
  );

  getIO().emit("dashboard:update");

  return actualizado;
}

/**
 * Elimina un usuario existente.
 *
 * Comprueba primero que el usuario exista.
 * Si no existe, se lanza un AppError antes de eliminar.
 *
 * @param id - El ID del usuario a eliminar.
 * @returns El usuario eliminado.
 */
export async function deleteExistingUser(
  id: number,
  context: UserCreationAuditContext
) {
  if (id === context.id_usuario) {
    throw new AppError(
      "No puedes eliminar tu propia cuenta",
      403,
      "SELF_DELETION_FORBIDDEN"
    );
  }

  const deleted = await prisma.$transaction(async (tx) => {
    const user = await getUserById(id, tx);

    if (!user) {
      throw new AppError(
        "Usuario no encontrado",
        404,
        "USER_NOT_FOUND"
      );
    }

    const deletedUser = await deleteUser(
      user.id_usuario,
      tx
    );

    await createAudit(
      {
        requestId: context.requestId,
        id_usuario: context.id_usuario,
        rol_actor: context.rol_actor,
        accion: "USUARIO_ELIMINADO",
        recurso: "USUARIO",
        id_recurso: user.id_usuario,
        resultado: "REALIZADA",
        codigo_error: null,
        detalles: null,
      },
      tx
    );

    return deletedUser;
  });

  getIO().emit("dashboard:update");

  return deleted;
}
