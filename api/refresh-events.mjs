import { Redis } from "@upstash/redis";
import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CACHE_KEY = "columbia-events:feed";
const SCRIPT_PATH = path.join(process.cwd(), "scripts", "fetch-events.mjs");

function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.authorization === `Bearer ${secret}`;
}

function runCollector(outputRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT_PATH], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        EVENT_CACHE_ROOT: outputRoot,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve(stdout);
      else {
        reject(
          new Error(
            `Event collector exited with code ${code}: ${stderr || stdout}`,
          ),
        );
      }
    });
  });
}

async function seedPreviousCache(outputRoot) {
  const publicDataDirectory = path.join(outputRoot, "public", "data");
  await mkdir(publicDataDirectory, { recursive: true });

  let cacheText = null;
  try {
    const existing = await redisClient().get(CACHE_KEY);
    if (existing?.events) cacheText = JSON.stringify(existing);
  } catch {
    // The first refresh has no runtime cache to seed.
  }

  cacheText ??= await readFile(
    path.join(process.cwd(), "public", "data", "events.json"),
    "utf8",
  );
  await writeFile(
    path.join(publicDataDirectory, "events.json"),
    cacheText,
    "utf8",
  );
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

  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "columbia-events-"),
  );

  try {
    await seedPreviousCache(temporaryRoot);
    const output = await runCollector(temporaryRoot);
    const cacheText = await readFile(
      path.join(temporaryRoot, "public", "data", "events.json"),
      "utf8",
    );
    const cache = JSON.parse(cacheText);

    await redisClient().set(CACHE_KEY, cache);

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
      collector: output.trim().split(/\r?\n/),
    });
  } catch (error) {
    console.error("Event refresh failed", error);
    response.setHeader("Cache-Control", "no-store");
    response.status(500).json({ ok: false, error: error.message });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
