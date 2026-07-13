/**
 * Regression tests for isTombstoneLive (packet 10, fix 1a).
 *
 * The callable/system write gate used this helper's `expiresMs > now`, which
 * treated a MALFORMED expiry as dead (`NaN > now` is false) and silently
 * re-opened server-side writes for a still-physically-present tombstone. The
 * fix makes a missing OR malformed expiry live; only a well-formed, expired
 * expiry is dead — matching the Rules existence-only gate.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { isTombstoneLive } = require("../lib/accountDeletionStatus");

const NOW = 1_700_000_000_000;

describe("isTombstoneLive", () => {
  it("is false for a missing tombstone", () => {
    expect(isTombstoneLive(null, NOW)).toBe(false);
    expect(isTombstoneLive(undefined, NOW)).toBe(false);
  });

  it("is true when expiresAt is missing (fail-closed)", () => {
    expect(isTombstoneLive({ uid: "u1" }, NOW)).toBe(true);
  });

  it("REGRESSION: a malformed expiry is live, not dead", () => {
    // Pre-fix this returned false (NaN > now === false) and re-opened writes.
    expect(isTombstoneLive({ expiresAt: "not-a-date" }, NOW)).toBe(true);
  });

  it("is true for a future expiry", () => {
    expect(isTombstoneLive({ expiresAt: NOW + 1000 }, NOW)).toBe(true);
  });

  it("is false for a finite expiry at or before now", () => {
    expect(isTombstoneLive({ expiresAt: NOW }, NOW)).toBe(false);
    expect(isTombstoneLive({ expiresAt: NOW - 1 }, NOW)).toBe(false);
  });

  it("accepts a Firestore Timestamp-like expiresAt (toMillis)", () => {
    const future = { toMillis: () => NOW + 5000 };
    const past = { toMillis: () => NOW - 5000 };
    expect(isTombstoneLive({ expiresAt: future }, NOW)).toBe(true);
    expect(isTombstoneLive({ expiresAt: past }, NOW)).toBe(false);
  });
});
