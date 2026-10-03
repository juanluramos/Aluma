import bcrypt from "bcryptjs";
import { createAudit } from "../auditoria/service.js";
import { findLocalAccountByEmail } from "../../repositories/auth/repository.js";
import { AppError } from "../../errors/app-error.js";
import { generateToken } from "../../utils/jwt.js";
// Eventos independientes: su persistencia nunca cambia el resultado del login.
async function auditLogin(requestId, codigo_error, actor) {
    const accion = codigo_error === null ? 'LOGIN_REALIZADO' : 'LOGIN_RECHAZADO';
    try {
        await createAudit({
            accion,
            recurso: 'USUARIO',
            id_recurso: actor?.id_usuario ?? null,
            resultado: codigo_error === null ? 'REALIZADA' : 'RECHAZADA',
            requestId,
            id_usuario: actor?.id_usuario ?? null,
            rol_actor: actor?.rol ?? null,
            codigo_error,
            detalles: null,
        });
    }
    catch {
        // No volcar el error de persistencia: podría incluir consultas o datos sensibles.
        console.error(`[AUDIT] AUDIT_WRITE_FAILED accion=${accion} requestId=${requestId}`);
    }
}
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
export async function loginUser(email, password, requestId) {
    const account = await findLocalAccountByEmail(email);
    if (!account || !account.password_hash) {
        await auditLogin(requestId, 'INVALID_CREDENTIALS');
        throw new AppError("Credenciales incorrectas", 401, "INVALID_CREDENTIALS");
    }
    const passwordMatches = await bcrypt.compare(password, account.password_hash);
    if (!passwordMatches) {
        await auditLogin(requestId, 'INVALID_CREDENTIALS');
        throw new AppError("Credenciales incorrectas", 401, "INVALID_CREDENTIALS");
    }
    const actor = {
        id_usuario: account.Usuario.id_usuario,
        rol: account.Usuario.RolUsuario.nombre_rol,
    };
    if (!account.Usuario.EstadoUsuario.permiteLogin) {
        await auditLogin(requestId, 'LOGIN_NOT_ALLOWED', actor);
        throw new AppError("El usuario no tiene permitido iniciar sesión", 403, "LOGIN_NOT_ALLOWED");
    }
    const token = generateToken({
        id_usuario: account.Usuario.id_usuario,
        rol: account.Usuario.RolUsuario.nombre_rol,
    });
    await auditLogin(requestId, null, actor);
    return {
        token,
    };
}
//# sourceMappingURL=service.js.map