/**
 * Tests for the admin-uid gate. The gate is the trust boundary
 * for every moderation callable — a bug here would either lock
 * legitimate moderators out (false negative) or let regular
 * users hit privileged endpoints (false positive). Both are
 * tested.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { isAdminUid, getAdminUidAllowlist, assertAdminCallable } = require(
  "../adminAuth",
);

const originalEnv = { ...process.env };

beforeEach(() => {
  delete process.env.ADMIN_UIDS;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("getAdminUidAllowlist", () => {
  it("returns an empty Set when ADMIN_UIDS is unset (fail-closed)", () => {
    // The bedrock: no env → no admins. A deploy that forgot to
    // set the env should fail every moderator action, not
    // silently allow everyone.
    const list = getAdminUidAllowlist();
    expect(list).toBeInstanceOf(Set);
    expect(list.size).toBe(0);
  });

  it("returns an empty Set when ADMIN_UIDS is blank/whitespace", () => {
    process.env.ADMIN_UIDS = "   ";
    expect(getAdminUidAllowlist().size).toBe(0);
  });

  it("parses a single uid", () => {
    process.env.ADMIN_UIDS = "uid-alice";
    const list = getAdminUidAllowlist();
    expect(list.has("uid-alice")).toBe(true);
    expect(list.size).toBe(1);
  });

  it("parses comma-separated multiple uids", () => {
    process.env.ADMIN_UIDS = "uid-alice,uid-bob,uid-charlie";
    const list = getAdminUidAllowlist();
    expect(list.has("uid-alice")).toBe(true);
    expect(list.has("uid-bob")).toBe(true);
    expect(list.has("uid-charlie")).toBe(true);
    expect(list.size).toBe(3);
  });

  it("trims whitespace around each uid", () => {
    // Pin tolerance — operator pasting from a tracker often
    // leaves spaces in. Don't fail closed on that.
    process.env.ADMIN_UIDS = " uid-alice , uid-bob  , uid-charlie ";
    const list = getAdminUidAllowlist();
    expect(list.has("uid-alice")).toBe(true);
    expect(list.has("uid-bob")).toBe(true);
    expect(list.has("uid-charlie")).toBe(true);
    expect(list.size).toBe(3);
  });

  it("filters out empty entries from trailing commas", () => {
    process.env.ADMIN_UIDS = "uid-alice,,uid-bob,";
    const list = getAdminUidAllowlist();
    expect(list.size).toBe(2);
  });
});

describe("isAdminUid", () => {
  it("returns false when ADMIN_UIDS is unset (fail-closed)", () => {
    expect(isAdminUid("any-uid")).toBe(false);
  });

  it("returns true for a listed uid", () => {
    process.env.ADMIN_UIDS = "uid-alice,uid-bob";
    expect(isAdminUid("uid-alice")).toBe(true);
    expect(isAdminUid("uid-bob")).toBe(true);
  });

  it("returns false for an unlisted uid", () => {
    process.env.ADMIN_UIDS = "uid-alice";
    expect(isAdminUid("uid-bob")).toBe(false);
  });

  it("returns false for non-string inputs", () => {
    process.env.ADMIN_UIDS = "uid-alice";
    expect(isAdminUid(undefined)).toBe(false);
    expect(isAdminUid(null)).toBe(false);
    expect(isAdminUid(123)).toBe(false);
    expect(isAdminUid("")).toBe(false);
  });

  it("re-reads env on every call (no module-load capture)", () => {
    // Pin that the gate isn't cached at module load — operators
    // can update the allowlist via functions:config:set without
    // a redeploy if the underlying mechanism supports it. The
    // env var changes are picked up next call.
    process.env.ADMIN_UIDS = "uid-alice";
    expect(isAdminUid("uid-alice")).toBe(true);
    process.env.ADMIN_UIDS = "uid-bob";
    expect(isAdminUid("uid-alice")).toBe(false);
    expect(isAdminUid("uid-bob")).toBe(true);
  });
});

describe("assertAdminCallable", () => {
  it("does NOT throw for a listed admin uid", () => {
    process.env.ADMIN_UIDS = "uid-alice";
    expect(() => assertAdminCallable("uid-alice")).not.toThrow();
  });

  it("throws an HttpsError for a non-admin uid", () => {
    // The error must be a firebase-functions HttpsError so the
    // client SDK surfaces it as a recognisable code, not a
    // generic 500.
    process.env.ADMIN_UIDS = "uid-alice";
    expect(() => assertAdminCallable("uid-bob")).toThrow(
      /moderator privileges/i,
    );
  });

  it("throws with code='permission-denied' (not 'unauthenticated')", () => {
    // The two codes mean different things. Permission-denied is
    // for "signed in but not authorised"; the unauth case has
    // its own preceding check in the callable. Confusing them
    // would muddle the client UX.
    process.env.ADMIN_UIDS = "uid-alice";
    try {
      assertAdminCallable("uid-bob");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err.code).toBe("permission-denied");
    }
  });

  it("throws when ADMIN_UIDS is unset (fail-closed)", () => {
    expect(() => assertAdminCallable("uid-alice")).toThrow();
  });
});
