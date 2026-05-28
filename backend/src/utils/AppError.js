class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.status = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }

  static badRequest(message, details) {
    return new AppError(message, 400, 'BAD_REQUEST', details);
  }

  static validationError(details, message = 'Error de validación en datos de entrada') {
    return new AppError(message, 400, 'VALIDATION_ERROR', details);
  }

  static unauthorized(message = 'No autenticado') {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }

  static forbidden(message = 'No autorizado') {
    return new AppError(message, 403, 'FORBIDDEN');
  }

  static notFound(message = 'No encontrado') {
    return new AppError(message, 404, 'NOT_FOUND');
  }
}

module.exports = { AppError };
