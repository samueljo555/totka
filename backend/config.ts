import 'dotenv/config';

export function loadJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.JWT_SECRET;
  if (!secret || secret.trim().length < 32) {
    throw new Error('JWT_SECRET wajib diisi dengan secret acak minimal 32 karakter.');
  }
  return secret;
}
