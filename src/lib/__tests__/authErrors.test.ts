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
import {
  friendlyAuthError,
  providerHint,
  duplicateEmailHint,
  AUTH_ERROR_FALLBACK,
} from "../authErrors";
import { __getRecentErrors } from "../errorReporting";

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

  it("invalid-email → 'Enter a valid email address'", () => {
    expect(friendlyAuthError(wrap("invalid-email"))).toBe(
      "Enter a valid email address"
    );
  });
});

describe("friendlyAuthError — transient / network", () => {
  it("network-request-failed → connection guidance", () => {
    expect(friendlyAuthError(wrap("network-request-failed"))).toBe(
      "Network issue. Check your connection and try again"
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
  it("shows a plain sentence, never the SDK's text, when no branch matches", () => {
    /* The caller displays the return value as-is, and the Login screen
       showed "Firebase: Error (auth/…)." to the person. The code goes to
       error reporting instead, where it can be given a branch. */
    expect(friendlyAuthError(wrap("multi-factor-auth-required"))).toBe(
      AUTH_ERROR_FALLBACK
    );
    expect(
      friendlyAuthError(wrap("some-new-code"), "Couldn't sign in. Try again.")
    ).toBe("Couldn't sign in. Try again.");
    expect(__getRecentErrors().at(-1)?.message).toBe(wrap("some-new-code"));
  });

  it("gives a non-Firebase message the fallback too", () => {
    expect(friendlyAuthError("Network connection lost")).toBe(
      AUTH_ERROR_FALLBACK
    );
  });

  it("names a missing email or password", () => {
    expect(friendlyAuthError(wrap("missing-email"))).toBe(
      "Enter your email address"
    );
    expect(friendlyAuthError(wrap("missing-password"))).toBe(
      "Enter your password"
    );
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
      "This account uses Google. Use Continue with Google to sign in."
    );
  });

  it("steers an Apple-only account to the Apple button", () => {
    expect(providerHint(["apple.com"])).toBe(
      "This account uses Apple. Use Continue with Apple to sign in."
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

describe("duplicateEmailHint", () => {
  it("names the password case (unlike providerHint)", () => {
    expect(duplicateEmailHint(["password"])).toBe(
      "This email already has a Tropos account with a password. Sign in with your email and password."
    );
    expect(duplicateEmailHint(["password", "google.com"])).toBe(
      "This email already has a Tropos account with a password. Sign in with your email and password."
    );
  });

  it("falls back to the provider steer for OAuth-only accounts", () => {
    expect(duplicateEmailHint(["apple.com"])).toBe(
      "This account uses Apple. Use Continue with Apple to sign in."
    );
    expect(duplicateEmailHint(["google.com"])).toBe(
      "This account uses Google. Use Continue with Google to sign in."
    );
  });

  it("returns null on an empty list — unknown, NOT no-account", () => {
    expect(duplicateEmailHint([])).toBeNull();
  });
});
