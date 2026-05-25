/**
 * Security audit 2026-05-25 finding #3 follow-up — token-revocation
 * verification for the `deleteMyAccount` callable.
 *
 * Pinned behaviours (lock context: F3 from
 * `docs/audits/2026-05-25-security-audit.md`):
 *   1. Tracer — valid token (verifyIdToken resolves) does not throw.
 *   2. Revoked token (verifyIdToken throws `auth/id-token-revoked`)
 *      surfaces as `failed-precondition` / `token-revoked`.
 *   3. Any other verifyIdToken failure surfaces as
 *      `unauthenticated` / `invalid-token` (fail-closed).
 *   4. Missing Authorization header throws unauthenticated.
 *   5. Malformed bearer (no "Bearer " prefix) throws unauthenticated.
 *   6. Empty bearer token (just "Bearer ") throws unauthenticated.
 *   7. The second arg to verifyIdToken is `true` — the contract that
 *      revocation IS checked. Pinned so the next person who changes
 *      this function can't accidentally drop the revocation knob.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function makeContext(authHeader) {
  return {
    rawRequest: {
      headers: authHeader === undefined ? {} : { authorization: authHeader },
    },
  };
}

describe("assertTokenNotRevoked", () => {
  it("Cycle 1 (tracer): valid token resolves without throwing", async () => {
    const { assertTokenNotRevoked } = require("../lib/accountDeletionAuth");
    const verifyIdToken = vi.fn(async () => ({ uid: "uid_alice" }));
    await expect(
      assertTokenNotRevoked({
        rawRequest: makeContext("Bearer eyJfake.token").rawRequest,
        verifyIdToken,
      })
    ).resolves.toBeUndefined();
    // Pinning the revocation-check contract — second arg MUST be true.
    expect(verifyIdToken).toHaveBeenCalledWith("eyJfake.token", true);
  });

  it("Cycle 2: revoked token → failed-precondition / token-revoked", async () => {
    const { assertTokenNotRevoked } = require("../lib/accountDeletionAuth");
    const verifyIdToken = vi.fn(async () => {
      const err = new Error("Firebase ID token has been revoked.");
      // Mirror Firebase Admin SDK's error code for the revoked case.
      err.code = "auth/id-token-revoked";
      throw err;
    });
    try {
      await assertTokenNotRevoked({
        rawRequest: makeContext("Bearer eyJrevoked.token").rawRequest,
        verifyIdToken,
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err.code).toBe("failed-precondition");
      expect(err.errorCode).toBe("token-revoked");
      expect(err.message).toMatch(/sign in again/i);
    }
  });

  it("Cycle 3: any other verifyIdToken failure → unauthenticated / invalid-token", async () => {
    const { assertTokenNotRevoked } = require("../lib/accountDeletionAuth");
    const verifyIdToken = vi.fn(async () => {
      const err = new Error("Firebase ID token has incorrect 'aud' claim.");
      err.code = "auth/argument-error";
      throw err;
    });
    try {
      await assertTokenNotRevoked({
        rawRequest: makeContext("Bearer eyJmalformed.token").rawRequest,
        verifyIdToken,
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err.code).toBe("unauthenticated");
      expect(err.errorCode).toBe("invalid-token");
    }
  });

  it("Cycle 4: missing Authorization header → unauthenticated", async () => {
    const { assertTokenNotRevoked } = require("../lib/accountDeletionAuth");
    const verifyIdToken = vi.fn();
    try {
      await assertTokenNotRevoked({
        rawRequest: makeContext(undefined).rawRequest,
        verifyIdToken,
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err.code).toBe("unauthenticated");
      expect(err.errorCode).toBe("invalid-token");
      // Defensive: verifyIdToken was never called — no point invoking
      // SDK with a known-missing token.
      expect(verifyIdToken).not.toHaveBeenCalled();
    }
  });

  it("Cycle 5: malformed bearer (no 'Bearer ' prefix) → unauthenticated", async () => {
    const { assertTokenNotRevoked } = require("../lib/accountDeletionAuth");
    const verifyIdToken = vi.fn();
    try {
      await assertTokenNotRevoked({
        rawRequest: makeContext("NotABearer eyJfake.token").rawRequest,
        verifyIdToken,
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err.code).toBe("unauthenticated");
      expect(verifyIdToken).not.toHaveBeenCalled();
    }
  });

  it("Cycle 6: empty bearer token ('Bearer ' with no payload) → unauthenticated", async () => {
    const { assertTokenNotRevoked } = require("../lib/accountDeletionAuth");
    const verifyIdToken = vi.fn();
    try {
      await assertTokenNotRevoked({
        rawRequest: makeContext("Bearer   ").rawRequest,
        verifyIdToken,
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err.code).toBe("unauthenticated");
      expect(verifyIdToken).not.toHaveBeenCalled();
    }
  });

  it("Cycle 7: verifyIdToken is always called with checkRevoked=true (contract pin)", async () => {
    // Belt-and-braces — independent assertion that future refactors
    // can't silently drop the revocation flag (e.g. by dropping the
    // second arg). This is the whole point of the helper.
    const { assertTokenNotRevoked } = require("../lib/accountDeletionAuth");
    const verifyIdToken = vi.fn(async () => ({ uid: "uid_x" }));
    await assertTokenNotRevoked({
      rawRequest: makeContext("Bearer abc.def.ghi").rawRequest,
      verifyIdToken,
    });
    expect(verifyIdToken.mock.calls[0][1]).toBe(true);
  });
});
