/**
 * Shared Firebase Auth error translation.
 *
 * Surfaces from two places today:
 *  - Login screen (`src/pages/Login.tsx`) on sign-in / sign-up failure
 *  - Account deletion reauth flow (`src/components/settings/AccountSection.tsx`)
 *    when `requires-recent-login` triggers inline reauth and the
 *    reauth itself fails
 *
 * Future surfaces (link-account, change-password, MFA enrolment)
 * should route through here too. The contract: take a raw Firebase
 * Auth error message (often "Firebase: Error (auth/<code>).") and
 * return a user-facing string. Falls through to the raw message if
 * no branch matches — callers should treat the return value as the
 * thing to display, not as a discriminated union.
 */

/**
 * If an email is registered ONLY with a social provider (no password),
 * return a message steering the user to that button — otherwise null (they
 * have a password, or the provider is unknown because Email-Enumeration-
 * Protection returned an empty list). This is what turns the dead-end
 * "Invalid email or password" / silent-reset trap into an actionable hint
 * for Google/Apple accounts.
 */
export function providerHint(methods: string[]): string | null {
  if (methods.length === 0 || methods.includes("password")) return null;
  if (methods.includes("google.com")) {
    return "This account uses Google — tap Continue with Google to sign in.";
  }
  if (methods.includes("apple.com")) {
    return "This account uses Apple — tap Continue with Apple to sign in.";
  }
  return null;
}

/**
 * Steer for `account-exists-with-different-credential` on the OAuth buttons
 * — the duplicate-account trap: a user with an existing email/password (or
 * other-provider) account taps the wrong button and gets a dead generic
 * error, so they give up or create a second account. Unlike providerHint
 * (which only steers AWAY from doomed password attempts), this also names
 * the password case. Returns null when the methods are unknown (enumeration
 * protection returns [] for every email — "unknown", never "no account").
 */
export function duplicateEmailHint(methods: string[]): string | null {
  if (methods.includes("password")) {
    return "This email already has a Tropos account with a password — sign in with your email and password.";
  }
  return providerHint(methods);
}

export function friendlyAuthError(message: string): string {
  if (
    message.includes("user-not-found") ||
    message.includes("wrong-password") ||
    message.includes("invalid-credential")
  ) {
    return "Invalid email or password";
  }
  if (message.includes("email-already-in-use")) {
    return "An account with this email already exists";
  }
  if (message.includes("weak-password")) {
    return "Password must be at least 6 characters";
  }
  if (message.includes("invalid-email")) {
    return "Please enter a valid email address";
  }
  if (message.includes("network-request-failed")) {
    return "Network issue — check your connection and try again";
  }
  if (message.includes("too-many-requests")) {
    return "Too many attempts. Wait a moment and try again";
  }
  if (message.includes("internal-error")) {
    return "Sign-in is temporarily unavailable. Try again in a moment";
  }
  if (message.includes("account-exists-with-different-credential")) {
    return "An account with this email already exists. Try signing in with the original provider";
  }
  if (message.includes("user-disabled")) {
    return "This account has been disabled. Contact support";
  }
  /* Reauth-specific codes — surface as the same logical messages
     as their sign-in equivalents. `requires-recent-login` is the
     trigger for the reauth flow itself, not an error the user
     should see surfaced. */
  if (message.includes("user-token-expired")) {
    return "Your session has expired. Sign out and sign back in";
  }
  if (message.includes("popup-blocked")) {
    return "Pop-up blocked. Allow pop-ups for this site and try again";
  }
  if (message.includes("operation-not-supported-in-this-environment")) {
    return "Sign-in unavailable in this browser. Try a different browser";
  }
  return message;
}
