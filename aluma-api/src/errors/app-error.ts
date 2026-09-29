/**
 * Error personalizado de la aplicación.
 *
 * Permite lanzar errores desde la lógica de negocio
 * indicando el código HTTP y un código interno.
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

    this.statusCode = statusCode;
    this.code = code;
  }
}