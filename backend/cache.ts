import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const USE_REDIS = process.env.USE_REDIS === 'true';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let redisClient: ReturnType<typeof createClient> | null = null;
let isRedisConnected = false;

if (USE_REDIS) {
  redisClient = createClient({ url: REDIS_URL });

  redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
    isRedisConnected = false;
  });

  redisClient.on('connect', () => {
    console.log('Connected to Redis');
    isRedisConnected = true;
  });

  redisClient.connect().catch((err) => {
    console.error('Failed to connect to Redis initially:', err);
    isRedisConnected = false;
  });
}

/**
 * Mendapatkan data dari cache, atau menjalankan fallback function (misal query DB) jika cache kosong/Redis mati.
 */
export async function getOrSetCache<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  // Jika redis tidak aktif atau belum connect, langsung fallback ke fungsi fetcher (Postgres)
  if (!USE_REDIS || !redisClient || !isRedisConnected) {
    return await fetcher();
  }

  try {
    const cachedData = await redisClient.get(key);
    if (cachedData) {
      return JSON.parse(cachedData) as T;
    }
  } catch (err) {
    console.error(`Redis Get Error for key ${key}:`, err);
    // Lanjutkan ke DB jika Redis error (graceful fallback)
  }

  // Jika tidak ada di cache, jalankan fetcher
  const data = await fetcher();

  try {
    if (isRedisConnected) {
      await redisClient.setEx(key, ttlSeconds, JSON.stringify(data));
    }
  } catch (err) {
    console.error(`Redis Set Error for key ${key}:`, err);
  }

  return data;
}

export async function deleteCache(key: string) {
  if (!USE_REDIS || !redisClient || !isRedisConnected) return;
  try {
    await redisClient.del(key);
  } catch (err) {
    console.error(`Redis Del Error for key ${key}:`, err);
  }
}
