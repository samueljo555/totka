import crypto from 'node:crypto';

// Exclude lookalikes (0/O, 1/I/L) so students can copy passwords from paper.
const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function studentPassword(): string {
  return Array.from({ length: 6 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
}

export function createLoginCardCipher(secret: string) {
  if (secret.trim().length < 32) throw new Error('LOGIN_CARD_SECRET harus minimal 32 karakter jika diisi.');
  const key = crypto.createHash('sha256').update('tka:login-cards:v1\0').update(secret).digest();
  return {
    seal(studentId: string, password: string): string {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(studentId));
      const data = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
      return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
    },
    open(studentId: string, encrypted: string): string {
      const [version, iv, tag, data, extra] = encrypted.split('.');
      if (version !== 'v1' || !iv || !tag || !data || extra !== undefined) throw new Error('Invalid login card envelope');
      const nonce = Buffer.from(iv, 'base64url');
      const authTag = Buffer.from(tag, 'base64url');
      if (nonce.length !== 12 || authTag.length !== 16) throw new Error('Invalid login card envelope');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAAD(Buffer.from(studentId));
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
    },
  };
}
