/**
 * Client-side admin gate (`isAdminUid`). UI-visibility only — the server is the
 * real trust boundary — but the defensive guards (null/empty/non-string → false)
 * are exactly what stop a logged-out or malformed identity from ever reading as
 * admin, so they're worth pinning. Allowlist comes from `VITE_ADMIN_UIDS`.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { isAdminUid } from "../adminAuth";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isAdminUid — defensive guards (env-independent)", () => {
  it("rejects null / undefined / empty string", () => {
    expect(isAdminUid(null)).toBe(false);
    expect(isAdminUid(undefined)).toBe(false);
    expect(isAdminUid("")).toBe(false);
  });

  it("rejects a non-string coerced through the API", () => {
    expect(isAdminUid(123 as unknown as string)).toBe(false);
  });
});

describe("isAdminUid — allowlist membership", () => {
  it("admits a uid present in VITE_ADMIN_UIDS", () => {
    vi.stubEnv("VITE_ADMIN_UIDS", "uidA,uidB");
    expect(isAdminUid("uidA")).toBe(true);
    expect(isAdminUid("uidB")).toBe(true);
  });

  it("rejects a uid absent from the allowlist", () => {
    vi.stubEnv("VITE_ADMIN_UIDS", "uidA,uidB");
    expect(isAdminUid("uidC")).toBe(false);
  });

  it("tolerates whitespace + empty entries in the env var", () => {
    vi.stubEnv("VITE_ADMIN_UIDS", " uidA , , uidB ");
    expect(isAdminUid("uidA")).toBe(true);
    expect(isAdminUid("uidB")).toBe(true);
    expect(isAdminUid("")).toBe(false);
  });

  it("admits no one when the allowlist is empty (no admins → 403 for all)", () => {
    vi.stubEnv("VITE_ADMIN_UIDS", "");
    expect(isAdminUid("uidA")).toBe(false);
  });
});
