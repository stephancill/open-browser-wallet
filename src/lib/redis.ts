import Redis, { RedisOptions } from "ioredis";

export const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const getRedisClient = (redisUrl: string, redisOpts?: RedisOptions) => {
  const client = new Redis(redisUrl, {
    connectTimeout: 5_000,
    maxRetriesPerRequest: null,
    ...redisOpts,
  });
  return client;
};

export const redis = getRedisClient(REDIS_URL);
