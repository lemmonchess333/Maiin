/**
 * Tests for the pure helpers in `src/lib/reauth.ts`. The reauth
 * functions themselves (`reauthWithPassword`, `reauthWithGoogle`,
 * `reauthWithApple`) require Firebase Auth mocking and live in
 * the AccountSection's integration surface; pinning the
 * provider-detection helpers here gives the contract a stable
 * test surface without that overhead.
 */
import { describe, it, expect } from "vitest";
import {
  isSupportedReauthProvider,
  SUPPORTED_REAUTH_PROVIDERS,
} from "../reauth";

describe("SUPPORTED_REAUTH_PROVIDERS", () => {
  it("contains exactly the three providers Tropos supports", () => {
    expect([...SUPPORTED_REAUTH_PROVIDERS]).toEqual([
      "password",
      "google.com",
      "apple.com",
    ]);
  });

  it("is frozen against mutation", () => {
    /* The const is `Object.freeze`d so consumers can't accidentally
       reorder or extend it. Pin this so a future refactor doesn't
       quietly drop the freeze. */
    expect(Object.isFrozen(SUPPORTED_REAUTH_PROVIDERS)).toBe(true);
  });
});

describe("isSupportedReauthProvider", () => {
  it("returns true for password", () => {
    expect(isSupportedReauthProvider("password")).toBe(true);
  });

  it("returns true for google.com", () => {
    expect(isSupportedReauthProvider("google.com")).toBe(true);
  });

  it("returns true for apple.com", () => {
    expect(isSupportedReauthProvider("apple.com")).toBe(true);
  });

  it("returns false for unsupported providers we know Firebase emits", () => {
    /* Tropos doesn't use phone / github / twitter / facebook auth.
       The deletion modal should fall back to the manual sign-out
       toast for users on these providers (the strikeout path). */
    expect(isSupportedReauthProvider("phone")).toBe(false);
    expect(isSupportedReauthProvider("github.com")).toBe(false);
    expect(isSupportedReauthProvider("twitter.com")).toBe(false);
    expect(isSupportedReauthProvider("facebook.com")).toBe(false);
  });

  it("returns false for the special 'firebase' providerId", () => {
    /* `firebase` is the providerId on the user record itself
       (not the federated identity). It's never something the
       reauth flow should target. */
    expect(isSupportedReauthProvider("firebase")).toBe(false);
  });

  it("returns false for empty string and unknown strings", () => {
    expect(isSupportedReauthProvider("")).toBe(false);
    expect(isSupportedReauthProvider("anonymous")).toBe(false);
    expect(isSupportedReauthProvider("custom")).toBe(false);
  });

  it("is case-sensitive (Firebase providerIds are lowercase)", () => {
    expect(isSupportedReauthProvider("Password")).toBe(false);
    expect(isSupportedReauthProvider("GOOGLE.COM")).toBe(false);
    expect(isSupportedReauthProvider("Apple.com")).toBe(false);
  });
});
