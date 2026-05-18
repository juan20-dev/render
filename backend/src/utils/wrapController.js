const { asyncHandler } = require('./asyncHandler');

/** Envuelve todos los handlers exportados de un controller con asyncHandler. */
const wrapController = (controller) => {
  if (!controller || typeof controller !== 'object') return controller;
  const wrapped = {};
  for (const [key, handler] of Object.entries(controller)) {
    wrapped[key] = typeof handler === 'function' ? asyncHandler(handler) : handler;
  }
  return wrapped;
};

module.exports = { wrapController };
