/**
 * R1A-Deletion Chunk 1 — server-side recent-auth check.
 *
 * The pure auth_time threshold check pinned in unit tests so the
 * security-critical predicate cannot regress. assertRecentAuth is
 * wired into deleteMyAccount + cancelDeletionRequest in Chunk 3;
 * these tests stand it up first.
 *
 * Why the test exists: getIdToken(true) refreshes the token but does
 * not update auth_time. A valid-but-old session token must be
 * rejected by the callable itself — Admin SDK Auth deletion bypasses
 * the client-side requires-recent-login check, so the security
 * boundary lives here.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const auth = require("../../../functions/lib/accountDeletionAuth.js");

const {
  RECENT_AUTH_MAX_AGE_SECONDS,
  checkRecentAuth,
  assertRecentAuth,
} = auth;

describe("checkRecentAuth", () => {
  it("threshold is 5 minutes (300s)", () => {
    expect(RECENT_AUTH_MAX_AGE_SECONDS).toBe(300);
  });

  it("returns null when auth_time is now", () => {
    const now = 1_700_000_000;
    expect(checkRecentAuth(now, now)).toBeNull();
  });

  it("returns null at the exact threshold boundary", () => {
    const now = 1_700_000_000;
    expect(checkRecentAuth(now - 300, now)).toBeNull();
  });

  it("returns error one second past the threshold", () => {
    const now = 1_700_000_000;
    const err = checkRecentAuth(now - 301, now);
    expect(err).not.toBeNull();
    expect(err.errorCode).toBe("requires-recent-auth");
    expect(err.code).toBe("failed-precondition");
    expect(err.message).toMatch(/Recent reauthentication required/);
    expect(err.message).toMatch(/301s/);
  });

  it("returns error when auth_time is missing entirely", () => {
    const err = checkRecentAuth(undefined as unknown as number, 1);
    expect(err).not.toBeNull();
    expect(err.errorCode).toBe("requires-recent-auth");
    expect(err.message).toMatch(/no auth_time claim/);
  });

  it("returns error when auth_time is zero or negative", () => {
    expect(checkRecentAuth(0, 1)).not.toBeNull();
    expect(checkRecentAuth(-100, 1)).not.toBeNull();
  });

  it("custom threshold for tests", () => {
    const now = 1_700_000_000;
    expect(checkRecentAuth(now - 60, now, 30)).not.toBeNull();
    expect(checkRecentAuth(now - 60, now, 120)).toBeNull();
  });
});

describe("assertRecentAuth (callable-context shape)", () => {
  it("throws when context.auth.token.auth_time is stale", () => {
    const stale = {
      auth: {
        token: {
          auth_time: 1_000,
        },
      },
    };
    const fixedNow = () => 100_000;
    expect(() => assertRecentAuth(stale, fixedNow)).toThrow(/Recent reauthentication required/);
  });

  it("does not throw when auth_time is recent", () => {
    const fresh = {
      auth: {
        token: {
          auth_time: 1_000_000,
        },
      },
    };
    const fixedNow = () => 1_000_010; // 10s old
    expect(() => assertRecentAuth(fresh, fixedNow)).not.toThrow();
  });

  it("throws when context.auth is missing", () => {
    expect(() => assertRecentAuth({}, () => 1)).toThrow();
    expect(() => assertRecentAuth(null, () => 1)).toThrow();
  });

  it("throws when token has no auth_time claim", () => {
    expect(() =>
      assertRecentAuth({ auth: { token: {} } }, () => 1),
    ).toThrow(/no auth_time claim/);
  });
});
