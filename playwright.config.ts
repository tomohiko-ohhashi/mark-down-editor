import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Browser tests: the real UI served by markdown-editor-server (web mode) on a
// throw-away folder. Run with `pnpm e2e` after `pnpm server:build`.
const port = 36670;
process.env.E2E_WORKSPACE ??= mkdtempSync(join(tmpdir(), "mde-e2e-"));

export default defineConfig({
  testDir: "e2e",
  // One server and one folder are shared; keep the order fixed.
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1280, height: 800 },
    locale: "ja-JP",
    trace: "off",
  },
  webServer: {
    command: "node e2e/serve.mjs",
    url: `http://localhost:${port}/?token=e2e`,
    reuseExistingServer: false,
    env: { E2E_WORKSPACE: process.env.E2E_WORKSPACE, E2E_PORT: String(port) },
  },
});
