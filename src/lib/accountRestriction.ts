/**
 * A restricted account, in the app's words (S4e, STATUS 2026-10-06).
 *
 * A moderator restricts an account from the report queue, and the server
 * then refuses everything that reaches another person: firestore.rules
 * (`isRestricted()`) for the writes the app makes itself, and
 * functions/lib/restriction.js for the callables (props, comments, likes,
 * reactions, Circles). The app says so where each of those actions would
 * be, in the line Soc5a pin 2 fixed — "Your account is restricted ·
 * Contact support" — so the words live here, once.
 *
 * What stays open is everything else: logging, the person's own profile,
 * reading, blocking, reporting, unfollowing, leaving, and taking back
 * their own props, likes and posts.
 */
import { toast } from "@/lib/toast";

declare const __APP_VERSION__: string;

/** `details.reason` on a callable's refusal. Pinned equal to the server's
 *  by `accountRestriction.cross.test.ts`. */
export const RESTRICTED_REASON = "account-restricted";

export const RESTRICTED_LINE = "Your account is restricted";

/** For a tap refused on the spot: props, a like, a reaction, a follow. */
export const RESTRICTED_TOAST =
  "Your account is restricted, so you can't do this for now.";

/** A mail to support that says what it is about. */
export function restrictedSupportHref(): string {
  const version =
    typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "unknown";
  const subject = "My Tropos account is restricted";
  const body = [
    "Tell us what happened and we'll take a look:",
    "",
    "",
    "---",
    `App version: ${version}`,
  ].join("\n");
  return `mailto:support@troposfit.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Whether an error is a callable refusing a restricted account. The rules'
 * refusals carry no reason (a Firestore permission-denied says nothing
 * about why), which is why the gates read the restriction before the
 * write rather than relying on this.
 */
export function isRestrictedRefusal(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const details = (err as { details?: unknown }).details;
  return (
    !!details &&
    typeof details === "object" &&
    (details as { reason?: unknown }).reason === RESTRICTED_REASON
  );
}

/** The toast a refused tap gets, with the way to support on it. */
export function showRestrictedToast(): void {
  toast.error(RESTRICTED_TOAST, {
    action: {
      label: "Contact support",
      onClick: () => {
        window.location.href = restrictedSupportHref();
      },
    },
  });
}
