import crypto from 'node:crypto';

// One-way (scrypt) — deliberately not recoverable, including by the admin.
// A freshly generated or reset password is returned once in that API
// response so it can be handed out, then never retrievable again.
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = (stored || '').split(':');
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, 'hex');
  const candidateBuffer = crypto.scryptSync(password, salt, 64);
  if (hashBuffer.length !== candidateBuffer.length) return false;
  return crypto.timingSafeEqual(hashBuffer, candidateBuffer);
}

// A password built from the name rather than a fully opaque random string —
// easier for the admin to read aloud or type when handing it to someone,
// while the random digits/symbol still keep it unique and non-guessable.
export function generatePasswordFromName(name) {
  const firstName = (name || '').trim().split(/\s+/)[0] || '';
  const base = firstName.replace(/[^a-zA-Z]/g, '') || 'User';
  const capitalized = base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
  const digits = crypto.randomInt(1000, 10000);
  const symbols = ['!', '@', '#', '$'];
  const symbol = symbols[crypto.randomInt(symbols.length)];
  return `${capitalized}${digits}${symbol}`;
}
