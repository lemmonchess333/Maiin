/**
 * How an account signs in, and the method last used on this phone.
 *
 * Apple's Hide My Email gives an account a relay address, so signing in
 * later with Google or a password makes a second, empty account that no
 * collision check can catch (Polish2 call 3). Login marks the method this
 * phone last used ("Last used"), and a new account's first setup screen
 * names the method it was made with.
 */
import { readString, writeString } from "@/lib/localStore";

export type SignInMethod = "password" | "google" | "apple";

const LAST_METHOD_KEY = "tropos.last_sign_in_method";

/** The method a Firebase provider id names, or null for any other. */
export function signInMethodOf(
  providerId: string | null | undefined
): SignInMethod | null {
  switch (providerId) {
    case "password":
      return "password";
    case "google.com":
      return "google";
    case "apple.com":
      return "apple";
    default:
      return null;
  }
}

/** The method's name in a sentence: "with Google", "with email". */
export function signInMethodLabel(method: SignInMethod): string {
  switch (method) {
    case "password":
      return "email";
    case "google":
      return "Google";
    case "apple":
      return "Apple";
  }
}

export function readLastSignInMethod(): SignInMethod | null {
  const stored = readString(LAST_METHOD_KEY);
  return stored === "password" || stored === "google" || stored === "apple"
    ? stored
    : null;
}

export function rememberSignInMethod(method: SignInMethod | null): void {
  if (method) writeString(LAST_METHOD_KEY, method);
}
