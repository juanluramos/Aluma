/**
 * Error personalizado de la aplicación.
 *
 * Permite lanzar errores desde la lógica de negocio
 * indicando el código HTTP y un código interno.
 */
/**
 * Error personalizado de la aplicación.
 *
 * Permite transportar:
 * - mensaje legible
 * - código HTTP
 * - código interno de error
 */
export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(
    message: string,
    statusCode: number,
    code: string
  ) {
    super(message);

    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;

    /**
     * Mantiene correctamente la cadena
     * de prototipos al extender Error.
     */
    Object.setPrototypeOf(
      this,
      AppError.prototype
    );
  }
}