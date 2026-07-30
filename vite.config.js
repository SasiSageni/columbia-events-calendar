import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const refreshScript = path.join(projectRoot, "scripts", "fetch-events.mjs");
const FIVE_MINUTES = 5 * 60 * 1000;

function eventRefreshPlugin() {
  let runningRefresh = null;
  let lastStartedAt = 0;

  function refreshSources(force = false) {
    if (runningRefresh) return runningRefresh;
    if (!force && Date.now() - lastStartedAt < FIVE_MINUTES) {
      return Promise.resolve({ refreshed: false, reason: "recently-refreshed" });
    }

    lastStartedAt = Date.now();
    runningRefresh = new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [refreshScript], {
        cwd: projectRoot,
        env: process.env,
        stdio: "inherit",
      });
      child.once("error", reject);
      child.once("exit", (code) => {
        if (code === 0) resolve({ refreshed: true });
        else reject(new Error(`Event refresh exited with code ${code}`));
      });
    }).finally(() => {
      runningRefresh = null;
    });
    return runningRefresh;
  }

  function attachRefreshServer(server) {
    server.middlewares.use("/api/refresh-events", async (_request, response) => {
      response.setHeader("Content-Type", "application/json");
      response.setHeader("Cache-Control", "no-store");
      try {
        const result = await refreshSources();
        response.statusCode = 200;
        response.end(JSON.stringify({ ok: true, ...result }));
      } catch (error) {
        response.statusCode = 503;
        response.end(JSON.stringify({ ok: false, error: error.message }));
      }
    });
  }

  return {
    name: "columbia-event-auto-refresh",
    configureServer: attachRefreshServer,
    configurePreviewServer: attachRefreshServer,
  };
}

export default defineConfig({
  plugins: [react(), eventRefreshPlugin()],
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
