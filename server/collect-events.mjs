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

const SCRIPT_PATH = path.join(process.cwd(), "scripts", "fetch-events.mjs");
const FALLBACK_PATH = path.join(
  process.cwd(),
  "public",
  "data",
  "events.json",
);

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

export async function collectEvents(previousCache = null) {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "columbia-events-"),
  );

  try {
    const publicDataDirectory = path.join(temporaryRoot, "public", "data");
    await mkdir(publicDataDirectory, { recursive: true });
    const seed = previousCache
      ? JSON.stringify(previousCache)
      : await readFile(FALLBACK_PATH, "utf8");
    await writeFile(
      path.join(publicDataDirectory, "events.json"),
      seed,
      "utf8",
    );

    const output = await runCollector(temporaryRoot);
    const cacheText = await readFile(
      path.join(publicDataDirectory, "events.json"),
      "utf8",
    );

    return {
      cache: JSON.parse(cacheText),
      collector: output.trim().split(/\r?\n/),
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
