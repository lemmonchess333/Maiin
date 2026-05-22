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
