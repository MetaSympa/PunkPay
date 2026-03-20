import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;

function getMasterKey(): Buffer {
  const key = process.env.MASTER_ENCRYPTION_KEY;
  if (!key) throw new Error('MASTER_ENCRYPTION_KEY not set');
  return Buffer.from(key, 'hex');
}

/**
 * Encrypt plaintext with AES-256-GCM using the server master key
 * Returns: base64(salt + iv + tag + ciphertext)
 */
export function encrypt(plaintext: string): string {
  const masterKey = getMasterKey();
  const salt = randomBytes(SALT_LENGTH);
  const key = scryptSync(masterKey, salt, 32);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
}

/**
 * Decrypt ciphertext encrypted with encrypt()
 */
export function decrypt(ciphertext: string): string {
  const masterKey = getMasterKey();
  const data = Buffer.from(ciphertext, 'base64');

  const salt = data.subarray(0, SALT_LENGTH);
  const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const encrypted = data.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

  const key = scryptSync(masterKey, salt, 32);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(encrypted) + decipher.final('utf8');
}

/**
 * Double encryption: first with user password (via Argon2 derived key), then with master key
 * For seed storage
 */
export function doubleEncrypt(plaintext: string, userKey: Buffer): string {
  const iv1 = randomBytes(IV_LENGTH);
  const cipher1 = createCipheriv(ALGORITHM, userKey.subarray(0, 32), iv1);
  const encrypted1 = Buffer.concat([cipher1.update(plaintext, 'utf8'), cipher1.final()]);
  const tag1 = cipher1.getAuthTag();

  const innerCiphertext = Buffer.concat([iv1, tag1, encrypted1]).toString('base64');
  return encrypt(innerCiphertext);
}

/**
 * Double decryption: unwrap master key layer, then user key layer
 */
export function doubleDecrypt(ciphertext: string, userKey: Buffer): string {
  const innerCiphertext = decrypt(ciphertext);
  const data = Buffer.from(innerCiphertext, 'base64');

  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, userKey.subarray(0, 32), iv);
  decipher.setAuthTag(tag);

  return decipher.update(encrypted) + decipher.final('utf8');
}
