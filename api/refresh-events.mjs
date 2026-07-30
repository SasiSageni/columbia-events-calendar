import { Redis } from "@upstash/redis";
import { collectEvents } from "../server/collect-events.mjs";

const CACHE_KEY = "columbia-events:feed";

function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.authorization === `Bearer ${secret}`;
}

function redisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Redis storage is not configured");
  return new Redis({ url, token });
}

export default async function handler(request, response) {
  if (!["GET", "POST"].includes(request.method)) {
    response.setHeader("Allow", "GET, POST");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!authorized(request)) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    response.status(503).json({ error: "Redis storage is not configured" });
    return;
  }

  try {
    const client = redisClient();
    let previousCache = null;
    try {
      previousCache = await client.get(CACHE_KEY);
    } catch {
      // The first refresh uses the bundled deployment cache.
    }
    const { cache, collector } = await collectEvents(previousCache);

    await client.set(CACHE_KEY, cache);

    response.setHeader("Cache-Control", "no-store");
    response.status(200).json({
      ok: true,
      generatedAt: cache.generatedAt,
      events: cache.events.length,
      sources: cache.sources.map(({ name, status, count }) => ({
        name,
        status,
        count,
      })),
      collector,
    });
  } catch (error) {
    console.error("Event refresh failed", error);
    response.setHeader("Cache-Control", "no-store");
    response.status(500).json({ ok: false, error: error.message });
  }
}
