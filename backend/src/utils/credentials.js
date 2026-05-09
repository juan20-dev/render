const crypto = require('crypto');

const generateTempPassword = (length = 12) => {
  const minLength = Math.max(12, length);
  const charset = {
    upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
    lower: 'abcdefghijkmnopqrstuvwxyz',
    number: '23456789',
    special: '!@#$%^&*()-_=+[]{};:,.?'
  };

  const pick = (pool) => pool[crypto.randomInt(0, pool.length)];
  const required = [
    pick(charset.upper),
    pick(charset.lower),
    pick(charset.number),
    pick(charset.special),
  ];

  const remainingLength = Math.max(minLength - required.length, 0);
  const fullPool = Object.values(charset).join('');
  const remaining = Array.from({ length: remainingLength }, () => pick(fullPool));
  const passwordChars = [...required, ...remaining];

  for (let index = passwordChars.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(0, index + 1);
    [passwordChars[index], passwordChars[swapIndex]] = [passwordChars[swapIndex], passwordChars[index]];
  }

  return passwordChars.join('');
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
