import { describe, it, expect } from "vitest";
import { needsEmailVerification } from "../emailVerificationGate";

// The client half of the verified-email gate warns only where the user can
// act: an email/password account that has not tapped its link. Everything
// else is left to the server's own refusal.
const password = { providerId: "password" } as const;
const google = { providerId: "google.com" } as const;

describe("needsEmailVerification", () => {
  it("gates an unverified email/password account", () => {
    expect(
      needsEmailVerification({
        emailVerified: false,
        providerData: [password] as never,
      })
    ).toBe(true);
  });

  it("does not gate a verified email/password account", () => {
    expect(
      needsEmailVerification({
        emailVerified: true,
        providerData: [password] as never,
      })
    ).toBe(false);
  });

  it("does not gate an OAuth account, verified or not — there is no link to resend", () => {
    expect(
      needsEmailVerification({
        emailVerified: false,
        providerData: [google] as never,
      })
    ).toBe(false);
  });

  it("gates a linked account that still has a password provider", () => {
    expect(
      needsEmailVerification({
        emailVerified: false,
        providerData: [google, password] as never,
      })
    ).toBe(true);
    expect(
      needsEmailVerification({
        emailVerified: false,
        providerData: [password, google] as never,
      })
    ).toBe(true);
  });

  it("treats a missing user or an unhydrated provider list as not gated", () => {
    expect(needsEmailVerification(null)).toBe(false);
    expect(needsEmailVerification(undefined)).toBe(false);
    expect(needsEmailVerification({ emailVerified: false })).toBe(false);
  });
});
