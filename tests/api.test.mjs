import assert from "node:assert/strict";
import test from "node:test";
import netlifyEventsHandler from "../netlify/functions/events.mjs";
import { config as netlifyRefreshConfig } from "../netlify/functions/refresh-events.mjs";

test("Netlify event API falls back to the bundled cache", async () => {
  const response = await netlifyEventsHandler(
    new Request("https://example.com/data/events.json"),
  );
  const cache = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-event-cache"), "deployment-fallback");
  assert.ok(cache.events.length > 0);
});

test("Netlify refresh is scheduled every five minutes", () => {
  assert.equal(netlifyRefreshConfig.schedule, "*/5 * * * *");
});
