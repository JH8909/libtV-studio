import { Queue } from "bullmq";

export const GENERATION_QUEUE = "generation";

export function redisConnectionOptions(redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379") {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null as null,
  };
}

export function createGenerationQueue() {
  return new Queue(GENERATION_QUEUE, { connection: redisConnectionOptions() });
}
