import { getStore } from "@netlify/blobs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const STORE_NAME = "columbia-events";
const CACHE_KEY = "feed";
const FALLBACK_PATH = path.join(process.cwd(), "public", "data", "events.json");

export default async (request) => {
  if (request.method !== "GET") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: { Allow: "GET" } },
    );
  }

  try {
    const store = getStore(STORE_NAME);
    const cache = await store.get(CACHE_KEY, {
      consistency: "strong",
      type: "json",
    });
    if (!cache || !Array.isArray(cache.events)) {
      throw new Error("No runtime event cache is available");
    }

    return Response.json(cache, {
      headers: {
        "Cache-Control":
          "public, max-age=0, s-maxage=60, stale-while-revalidate=240",
        "X-Event-Cache": "netlify-blobs",
      },
    });
  } catch {
    const fallback = await readFile(FALLBACK_PATH, "utf8");
    return new Response(fallback, {
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=60",
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "X-Event-Cache": "deployment-fallback",
      },
    });
  }
};
