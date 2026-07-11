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
