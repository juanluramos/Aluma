import bcrypt from "bcryptjs";
import { findLocalAccountByEmail } from "../../repositories/auth/repository.js";
import { AppError } from "../../errors/app-error.js";
import { generateToken } from "../../utils/jwt.js";
/**
 * Autentica un usuario mediante una cuenta local.
 *
 * Comprueba:
 * 1. Que exista la cuenta.
 * 2. Que tenga una contraseña almacenada.
 * 3. Que la contraseña proporcionada coincida.
 * 4. Que el usuario tenga permitido iniciar sesión.
 * 5. Genera un JWT para el usuario autenticado.
 */
export async function loginUser(email, password) {
    const account = await findLocalAccountByEmail(email);
    if (!account || !account.password_hash) {
        throw new AppError("Credenciales incorrectas", 401, "INVALID_CREDENTIALS");
    }
    const passwordMatches = await bcrypt.compare(password, account.password_hash);
    if (!passwordMatches) {
        throw new AppError("Credenciales incorrectas", 401, "INVALID_CREDENTIALS");
    }
    if (!account.Usuario.EstadoUsuario.permiteLogin) {
        throw new AppError("El usuario no tiene permitido iniciar sesión", 403, "LOGIN_NOT_ALLOWED");
    }
    const token = generateToken({
        id_usuario: account.Usuario.id_usuario,
        rol: account.Usuario.RolUsuario.nombre_rol,
    });
    return {
        token,
    };
}
//# sourceMappingURL=service.js.map