import assert from "node:assert/strict";
import test from "node:test";
import eventsHandler from "../api/events.mjs";
import refreshHandler from "../api/refresh-events.mjs";

function createResponse() {
  const headers = new Map();
  const chunks = [];
  return {
    statusCode: 200,
    headers,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.setHeader("Content-Type", "application/json; charset=utf-8");
      this.end(JSON.stringify(payload));
    },
    write(chunk) {
      chunks.push(Buffer.from(chunk));
    },
    end(chunk) {
      if (chunk) chunks.push(Buffer.from(chunk));
      this.body = Buffer.concat(chunks).toString("utf8");
    },
  };
}

test("event API serves the bundled cache when Redis is not configured", async () => {
  const response = createResponse();
  await eventsHandler({ method: "GET" }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers.get("x-event-cache"), "deployment-fallback");
  const cache = JSON.parse(response.body);
  assert.ok(Array.isArray(cache.events));
  assert.ok(cache.events.length > 0);
});

test("refresh API rejects unauthenticated requests", async () => {
  const response = createResponse();
  await refreshHandler(
    { method: "POST", headers: { authorization: "" } },
    response,
  );

  assert.equal(response.statusCode, 401);
  assert.deepEqual(JSON.parse(response.body), { error: "Unauthorized" });
});
