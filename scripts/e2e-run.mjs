#!/usr/bin/env node
/**
 * Local e2e runner for Accounti.
 *
 * Examples:
 *   npm run test:e2e
 *   npm run test:e2e:headed
 *   npm run test:e2e:headed -- --slow
 *   npm run test:e2e:headed -- --slower
 *
 * --slow  → headed, maximized, slowMo 800ms (2×), on-screen toasts
 * --slower → headed, maximized, slowMo 1200ms (3×), on-screen toasts
 * Servers start on the normal local ports (3060/3061) unless E2E_* env vars override them.
 * Existing `npm run dev` is reused when already up. Demo auth + POST /auth/e2e/reset keep
 * the dedicated /autotest tenant clean without deploying.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const raw = process.argv.slice(2);
const slower = raw.includes("--slower");
const slow = raw.includes("--slow");
const headedFlag = raw.includes("--headed") || process.env.npm_lifecycle_event === "test:e2e:headed";
const passthrough = raw.filter((arg) => arg !== "--slower" && arg !== "--slow" && arg !== "--headed");

const home = process.env.HOME || "";
const localDeps = path.join(home, ".local/playwright-deps");
const libDirs = [
  path.join(localDeps, "usr/lib/x86_64-linux-gnu"),
  path.join(localDeps, "lib/x86_64-linux-gnu"),
].filter(Boolean);

const env = { ...process.env };
env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS || "1";
if (libDirs.length) {
  env.LD_LIBRARY_PATH = [...libDirs, env.LD_LIBRARY_PATH || ""].filter(Boolean).join(":");
}

const narrate = slower || slow;
if (headedFlag || narrate) env.HEADED = "1";
if (narrate) {
  env.E2E_NARRATE = "1";
  if (slower) {
    env.SLOWER = "1";
    env.SLOW_MO = env.SLOW_MO || "1200";
  } else {
    env.SLOW = "1";
    env.SLOW_MO = env.SLOW_MO || "800";
  }
}

const args = ["playwright", "test", "-c", "e2e/playwright.config.ts", ...passthrough];
const child = spawn("npx", args, { cwd: root, env, stdio: "inherit" });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
