/**
 * Test surface for the Firebase Auth error translator.
 *
 * The helper is consumed by two surfaces today:
 *   - src/pages/Login.tsx — sign-in / sign-up failure path
 *   - src/components/settings/AccountSection.tsx — R1A Chunk 4
 *     reauth view (in-modal error display)
 *
 * Both consumers depend on the same mapping table. Drift between
 * them (e.g., a typo in one branch surfacing the raw Firebase
 * string for that code) would be invisible without a test pinning
 * the contract. These tests cover every documented Firebase Auth
 * error code we explicitly handle, plus the fallthrough behaviour
 * for unknown codes.
 */
import { describe, it, expect } from "vitest";
import { friendlyAuthError, providerHint } from "../authErrors";

/* Raw Firebase Auth error messages typically look like:
   "Firebase: Error (auth/<code>)."
   The translator does substring matching on `<code>`, so any
   wrapper text around the code is fine. Tests use the realistic
   wrapper to avoid false-pass risk from matching against the
   bare code in isolation. */
function wrap(code: string): string {
  return `Firebase: Error (auth/${code}).`;
}

describe("friendlyAuthError — invalid-credentials bucket", () => {
  it("user-not-found → 'Invalid email or password'", () => {
    expect(friendlyAuthError(wrap("user-not-found"))).toBe(
      "Invalid email or password"
    );
  });

  it("wrong-password → 'Invalid email or password'", () => {
    expect(friendlyAuthError(wrap("wrong-password"))).toBe(
      "Invalid email or password"
    );
  });

  it("invalid-credential → 'Invalid email or password' (Firebase Auth's modern consolidated code)", () => {
    /* As of Firebase Auth 9.7+, the legacy user-not-found and
       wrong-password codes were consolidated into a single
       invalid-credential code for privacy (don't leak account
       existence). The helper covers all three for backwards-
       compatibility with both old and new Firebase versions. */
    expect(friendlyAuthError(wrap("invalid-credential"))).toBe(
      "Invalid email or password"
    );
  });
});

describe("friendlyAuthError — sign-up-specific codes", () => {
  it("email-already-in-use → 'An account with this email already exists'", () => {
    expect(friendlyAuthError(wrap("email-already-in-use"))).toBe(
      "An account with this email already exists"
    );
  });

  it("weak-password → 'Password must be at least 6 characters'", () => {
    expect(friendlyAuthError(wrap("weak-password"))).toBe(
      "Password must be at least 6 characters"
    );
  });

  it("invalid-email → 'Please enter a valid email address'", () => {
    expect(friendlyAuthError(wrap("invalid-email"))).toBe(
      "Please enter a valid email address"
    );
  });
});

describe("friendlyAuthError — transient / network", () => {
  it("network-request-failed → connection guidance", () => {
    expect(friendlyAuthError(wrap("network-request-failed"))).toBe(
      "Network issue — check your connection and try again"
    );
  });

  it("too-many-requests → wait-and-retry copy", () => {
    expect(friendlyAuthError(wrap("too-many-requests"))).toBe(
      "Too many attempts. Wait a moment and try again"
    );
  });

  it("internal-error → 'temporarily unavailable' copy", () => {
    expect(friendlyAuthError(wrap("internal-error"))).toBe(
      "Sign-in is temporarily unavailable. Try again in a moment"
    );
  });
});

describe("friendlyAuthError — account-state codes", () => {
  it("account-exists-with-different-credential → guides to original provider", () => {
    expect(
      friendlyAuthError(wrap("account-exists-with-different-credential"))
    ).toBe(
      "An account with this email already exists. Try signing in with the original provider"
    );
  });

  it("user-disabled → contact-support copy", () => {
    expect(friendlyAuthError(wrap("user-disabled"))).toBe(
      "This account has been disabled. Contact support"
    );
  });
});

describe("friendlyAuthError — reauth-specific codes (R1A Chunk 4)", () => {
  it("user-token-expired → sign-out-and-back-in guidance", () => {
    /* Refresh token irrecoverable. Reauth can't recover inline;
       caller falls back to manual sign-out. */
    expect(friendlyAuthError(wrap("user-token-expired"))).toBe(
      "Your session has expired. Sign out and sign back in"
    );
  });

  it("popup-blocked → allow-popups guidance", () => {
    expect(friendlyAuthError(wrap("popup-blocked"))).toBe(
      "Pop-up blocked. Allow pop-ups for this site and try again"
    );
  });

  it("operation-not-supported-in-this-environment → different-browser guidance", () => {
    /* In-app browsers (Twitter, Instagram embeds) block OAuth
       popups. The reauth helper catches this code and falls
       back to redirect, but if it surfaces somewhere else,
       the user-facing copy still applies. */
    expect(
      friendlyAuthError(wrap("operation-not-supported-in-this-environment"))
    ).toBe("Sign-in unavailable in this browser. Try a different browser");
  });
});

describe("friendlyAuthError — fallthrough behaviour", () => {
  it("returns the raw message when no branch matches", () => {
    /* Caller is expected to display the return value as-is.
       For unknown codes we surface the original message rather
       than masking with a generic 'Something went wrong' —
       the raw message is at least informative for operator
       triage, even if not friendly for the user. */
    expect(friendlyAuthError(wrap("multi-factor-auth-required"))).toBe(
      wrap("multi-factor-auth-required")
    );
  });

  it("returns non-Firebase error messages verbatim", () => {
    expect(friendlyAuthError("Network connection lost")).toBe(
      "Network connection lost"
    );
  });

  it("returns empty string for empty input", () => {
    expect(friendlyAuthError("")).toBe("");
  });
});

describe("friendlyAuthError — substring matching robustness", () => {
  it("matches the bare code without wrapper", () => {
    expect(friendlyAuthError("user-not-found")).toBe(
      "Invalid email or password"
    );
  });

  it("matches when code is embedded in a longer message", () => {
    expect(
      friendlyAuthError(
        "Some prefix Firebase Error (auth/wrong-password) some suffix"
      )
    ).toBe("Invalid email or password");
  });

  it("matches the first branch even if multiple codes appear in the string", () => {
    /* Defensive — if a Firebase upgrade ever produces a chained
       error with multiple codes, we match the FIRST branch in
       the order declared. This test pins that ordering matters
       so a future refactor doesn't accidentally reshuffle. */
    expect(
      friendlyAuthError(
        "auth/wrong-password followed by auth/network-request-failed"
      )
    ).toBe("Invalid email or password");
  });
});

describe("providerHint", () => {
  it("steers a Google-only account to the Google button", () => {
    expect(providerHint(["google.com"])).toBe(
      "This account uses Google — tap Continue with Google to sign in."
    );
  });

  it("steers an Apple-only account to the Apple button", () => {
    expect(providerHint(["apple.com"])).toBe(
      "This account uses Apple — tap Continue with Apple to sign in."
    );
  });

  it("returns null when the account HAS a password (nothing to steer)", () => {
    expect(providerHint(["password"])).toBeNull();
    expect(providerHint(["password", "google.com"])).toBeNull();
  });

  it("returns null on an empty list — unknown, NOT no-account (enumeration protection)", () => {
    expect(providerHint([])).toBeNull();
  });
});
