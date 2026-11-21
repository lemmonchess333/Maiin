/**
 * Shared verifier environment (audit batch 5).
 *
 * These drivers exist ONLY to drive a local preview against the Firebase
 * emulator. Two rails, both fail-closed:
 *   1. The target must be loopback — a BASE_URL pointing anywhere else
 *      throws before a single page is opened, so the seeded emulator
 *      credential can never be replayed against a real deployment.
 *   2. The password comes from TEST_PASSWORD when set; the fallback is
 *      the emulator seed identity from scripts/seed-e2e-user.ts and is
 *      only reachable AFTER the loopback check has passed.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const BASE = process.env.BASE_URL || "http://localhost:4173/Maiin/";

const host = new URL(BASE).hostname;
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
  throw new Error(
    `verifier-tropos-web refuses non-loopback target "${host}" — these ` +
      "drivers are emulator-only. Run against a local preview."
  );
}

export const PW = process.env.TEST_PASSWORD || "test-password-123";
export const EMAIL = process.env.TEST_EMAIL || "e2e-test@tropos.test";

/**
 * The Chromium to launch: CHROMIUM_PATH or PW_CHROMIUM when set, else the
 * newest pre-installed build under /opt/pw-browsers (cloud sandboxes ship
 * one for a different Playwright than this repo's, and its build number
 * changes between images), else undefined for Playwright's own.
 */
function preinstalledChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!existsSync(root)) return undefined;
  const builds = readdirSync(root)
    .map((d) => /^chromium-(\d+)$/.exec(d))
    .filter(Boolean)
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  for (const b of builds)
    for (const sub of ["chrome-linux64", "chrome-linux"]) {
      const exe = join(root, b[0], sub, "chrome");
      if (existsSync(exe)) return exe;
    }
  return undefined;
}

export const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ||
  process.env.PW_CHROMIUM ||
  preinstalledChromium();
