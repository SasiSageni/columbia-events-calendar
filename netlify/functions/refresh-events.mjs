import { getStore } from "@netlify/blobs";
import { collectEvents } from "../../server/collect-events.mjs";

const STORE_NAME = "columbia-events";
const CACHE_KEY = "feed";

export default async () => {
  const store = getStore(STORE_NAME);
  let previousCache = null;
  try {
    previousCache = await store.get(CACHE_KEY, {
      consistency: "strong",
      type: "json",
    });
  } catch {
    // The first scheduled run uses the bundled deployment cache.
  }

  const { cache, collector } = await collectEvents(previousCache);
  await store.setJSON(CACHE_KEY, cache);

  console.log(
    JSON.stringify({
      message: "Event cache refreshed",
      generatedAt: cache.generatedAt,
      events: cache.events.length,
      sources: cache.sources.map(({ name, status, count }) => ({
        name,
        status,
        count,
      })),
      collector,
    }),
  );

  return new Response(null, { status: 204 });
};

export const config = {
  schedule: "*/5 * * * *",
};
