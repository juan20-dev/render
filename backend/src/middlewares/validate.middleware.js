const { ZodError } = require('zod');
const { AppError } = require('../utils/AppError');

/**
 * @param {import('zod').ZodSchema} schema
 * @param {'body'|'query'|'params'} source
 */
const validate =
  (schema, source = 'body') =>
  (req, res, next) => {
    try {
      const parsed = schema.parse(req[source]);
      req.validated = { ...(req.validated || {}), [source]: parsed };
      if (source === 'body') req.body = parsed;
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        const issues = err.issues || err.errors || [];
        const details = issues.map((e) => ({
          path: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
          message: e.message,
        }));
        const preview = details
          .slice(0, 2)
          .map((d) => `${d.path || 'campo'}: ${d.message}`)
          .join(' | ');
        return next(
          AppError.validationError(
            details,
            preview
              ? `Error de validación en ${source}: ${preview}`
              : `Error de validación en ${source}: revise los campos enviados`
          )
        );
      }
      return next(err);
    }
  };

module.exports = { validate };
