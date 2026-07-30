import { Redis } from "@upstash/redis";
import { readFile } from "node:fs/promises";
import path from "node:path";

const CACHE_KEY = "columbia-events:feed";
const FALLBACK_PATH = path.join(process.cwd(), "public", "data", "events.json");

function sendJson(response, status, payload, extraHeaders = {}) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  for (const [name, value] of Object.entries(extraHeaders)) {
    response.setHeader(name, value);
  }
  response.end(typeof payload === "string" ? payload : JSON.stringify(payload));
}

async function readFallback() {
  return readFile(FALLBACK_PATH, "utf8");
}

function redisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Redis storage is not configured");
  return new Redis({ url, token });
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const cache = await redisClient().get(CACHE_KEY);
    if (!cache || !Array.isArray(cache.events)) {
      throw new Error("No runtime event cache is available");
    }

    sendJson(response, 200, cache, {
      "Cache-Control":
        "public, max-age=0, s-maxage=60, stale-while-revalidate=240",
      "X-Event-Cache": "upstash-redis",
    });
  } catch (error) {
    try {
      const fallback = await readFallback();
      sendJson(response, 200, fallback, {
        "Cache-Control": "public, max-age=0, s-maxage=60",
        "X-Event-Cache": "deployment-fallback",
        "X-Event-Cache-Warning": "runtime-cache-unavailable",
      });
    } catch (fallbackError) {
      sendJson(response, 503, {
        error: "Event feed is unavailable",
        detail: fallbackError.message,
      });
    }
  }
}
