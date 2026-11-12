import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const headed = process.env.HEADED === "1" || process.env.HEADED === "true";
const narrate =
  process.env.E2E_NARRATE === "1" ||
  process.env.SLOWER === "1" ||
  process.env.SLOWER === "true" ||
  process.env.SLOW === "1" ||
  process.env.SLOW === "true";
/** --slow → 800ms (2×), --slower → 1200ms (3×). Override with SLOW_MO. */
const slowMo = Number(process.env.SLOW_MO || 0);
const spaPort = Number(process.env.E2E_SPA_PORT || 3060);
const apiPort = Number(process.env.E2E_API_PORT || 3061);
const root = path.resolve(__dirname, "..");
const reuse = process.env.E2E_REUSE_SERVER !== "0";
const desktop = devices["Desktop Chrome"];

export default defineConfig({
  testDir: __dirname,
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: narrate ? 300_000 : 120_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: path.join(root, "playwright-report") }]],
  outputDir: path.join(root, "test-results"),
  use: {
    baseURL: process.env.E2E_BASE_URL || `http://127.0.0.1:${spaPort}`,
    headless: !headed,
    ...(headed
      ? { viewport: null, deviceScaleFactor: undefined }
      : { viewport: desktop.viewport }),
    launchOptions: {
      slowMo: slowMo > 0 ? slowMo : undefined,
      args: headed ? ["--start-maximized"] : [],
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: headed ? "on" : "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: headed
        ? { ...desktop, viewport: null, deviceScaleFactor: undefined }
        : { ...desktop },
    },
  ],
  webServer: [
    {
      command: `npx tsx server/local.ts`,
      cwd: root,
      url: `http://127.0.0.1:${apiPort}/health`,
      reuseExistingServer: reuse,
      timeout: 120_000,
      env: {
        ...process.env,
        PORT: String(apiPort),
        DEMO_AUTH: "1",
        STORE: "memory",
        STORE_FILE: process.env.E2E_STORE_FILE || path.join(root, "data/e2e-store.json"),
        MAIL_DISABLE_SEND: "true",
      },
    },
    {
      command: `npm --prefix spa run dev -- --host 127.0.0.1 --port ${spaPort}`,
      cwd: root,
      url: `http://127.0.0.1:${spaPort}`,
      reuseExistingServer: reuse,
      timeout: 120_000,
      env: {
        ...process.env,
        // Empty → SPA uses Vite `/api` proxy (avoids browser CORS to the API port).
        VITE_API_BASE_URL: process.env.E2E_VITE_API_BASE_URL || "",
      },
    },
  ],
});
