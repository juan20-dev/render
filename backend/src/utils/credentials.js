const crypto = require('crypto');

const generateTempPassword = (length = 16) => {
  // Generar token alfanumérico seguro sin caracteres especiales
  // para evitar problemas de encoding en emails y forms
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(crypto.randomInt(0, charset.length));
  }
  return password;
};

const isStrongPassword = (password) => {
  if (typeof password !== 'string') return false;

  const value = password.trim();
  if (value.length < 8) return false;
  if (!/[A-Z]/.test(value)) return false;
  if (!/[a-z]/.test(value)) return false;
  if (!/\d/.test(value)) return false;

  return true;
};

module.exports = {
  generateTempPassword,
  isStrongPassword,
};
