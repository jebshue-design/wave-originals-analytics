import crypto from 'node:crypto';

// Reversible (not one-way hashed) so the admin dashboard can show these
// passwords back in plain text — a deliberate tradeoff for this small
// internal tool: anyone with admin access and this key can recover any
// account's password, in exchange for the admin being able to look them up.
function getEncryptionKey() {
  const keyHex = process.env.ACCOUNT_ENCRYPTION_KEY;
  if (!keyHex) throw new Error('ACCOUNT_ENCRYPTION_KEY is not set');
  return Buffer.from(keyHex, 'hex');
}

export function encryptPassword(password) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptPassword(stored) {
  const [ivHex, tagHex, dataHex] = (stored || '').split(':');
  if (!ivHex || !tagHex || !dataHex) return null;
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

export function passwordMatches(candidate, storedEncrypted) {
  let actual;
  try {
    actual = decryptPassword(storedEncrypted);
  } catch {
    return false;
  }
  if (actual === null) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(actual);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
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
