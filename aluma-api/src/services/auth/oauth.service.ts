import { findOAuthAccount, createOAuthAccount } from '../../repositories/auth/repository.js';
import { findUserByEmail } from '../../repositories/usuario/repository.js';
import { AppError } from '../../errors/app-error.js';
import { generateToken } from '../../utils/jwt.js';



/**
 * Busca un usuario existente mediante su email.
 */
export async function findExistingUserByEmail(email: string) {
  return findUserByEmail(email);
}

/**
 * Vincula una cuenta OAuth a un usuario existente.
 *
 * @param idUsuario - ID del usuario de ALUMA.
 * @param proveedor - Proveedor OAuth.
 * @param email - Email proporcionado por el proveedor.
 * @param externalId - Identificador del usuario en el proveedor.
 */
export async function linkOAuthAccount(
  idUsuario: number,
  proveedor: string,
  email: string,
  externalId: string,
) {
  return createOAuthAccount({
    id_usuario: idUsuario,
    proveedor,
    email,
    external_id: externalId,
  });
}

/**
 * Busca una cuenta OAuth sin lanzar error
 * cuando no existe.
 */
export async function getOAuthAccount(proveedor: string, externalId: string) {
  return findOAuthAccount(proveedor, externalId);
}

/**
 * Resuelve la autenticación OAuth de un usuario.
 *
 * Flujo:
 * 1. Busca una cuenta OAuth existente.
 * 2. Si existe, comprueba si el usuario puede iniciar sesión
 *    y genera un JWT.
 * 3. Si no existe, busca un usuario por email.
 * 4. Si existe el usuario, vincula la cuenta OAuth.
 * 5. Si no existe el usuario, solicita el registro.
 */
export async function authenticateWithOAuth(
  proveedor: string,
  externalId: string,
  email: string
) {
  const account = await getOAuthAccount(
    proveedor,
    externalId
  );

  /**
   * Cuenta OAuth ya vinculada.
   * Realizamos el login.
   */
  if (account) {
    if (!account.Usuario.EstadoUsuario.permiteLogin) {
      throw new AppError(
        "El usuario no tiene permitido iniciar sesión",
        403,
        "LOGIN_NOT_ALLOWED"
      );
    }

    const token = generateToken({
      id_usuario: account.Usuario.id_usuario,
      rol: account.Usuario.RolUsuario.nombre_rol,
    });

    return {
      type: "login" as const,
      token,
    };
  }

  /**
   * No existe una cuenta OAuth.
   * Buscamos si ya existe un usuario ALUMA
   * con el mismo email.
   */
  const user = await findExistingUserByEmail(email);

  /**
   * El usuario existe.
   * Vinculamos la cuenta OAuth.
   */
  if (user) {
    const linkedAccount = await linkOAuthAccount(
      user.id_usuario,
      proveedor,
      email,
      externalId
    );

    return {
      type: "linked" as const,
      account: linkedAccount,
    };
  }

  /**
   * No existe ni la cuenta OAuth ni el usuario.
   * El registro se implementará posteriormente.
   */
  return {
    type: "registration_required" as const,
  };
}
