/**
 * Why starting a partner streak was refused, in the user's words.
 *
 * `startPartnerStreak` (functions/lib/partnerBonds.js) refuses with a
 * reason in `details.reason` and in the message; this maps each to a
 * sentence. `startRejection.test.ts` pins every reason the server can
 * raise to one here, so a new refusal cannot quietly reach the person as
 * the fallback.
 *
 * The blocked case says less than it knows, as joining a Circle does: a
 * block either way refuses, and naming it would tell the person that the
 * other has blocked them.
 */

import {
  isRestrictedRefusal,
  RESTRICTED_TOAST,
} from "@/lib/accountRestriction";
import { MAX_PARTNERS } from "./streakEngine";

/** The fallback. Says the streak did not start and nothing it cannot support. */
export const START_FAILED_FALLBACK = "Couldn't start the streak. Try again.";

function reasonOf(err: unknown): string {
  const details = (err as { details?: unknown })?.details;
  const reason =
    details && typeof details === "object"
      ? (details as { reason?: unknown }).reason
      : undefined;
  if (typeof reason === "string") return reason;
  return String((err as { message?: unknown })?.message ?? "");
}

export function describeStartRejection(
  err: unknown,
  partnerName: string
): string {
  if (isRestrictedRefusal(err)) return RESTRICTED_TOAST;
  const reason = reasonOf(err);
  if (reason.includes("partner-limit-yours")) {
    return `You have ${MAX_PARTNERS} streak partners already. End one to start another.`;
  }
  if (reason.includes("partner-limit-theirs")) {
    return `${partnerName} has ${MAX_PARTNERS} streak partners already.`;
  }
  if (reason.includes("mutual-follow-required")) {
    return `You and ${partnerName} need to follow each other to start a streak.`;
  }
  if (reason.includes("blocked-pair")) {
    return "You can't start a streak with this person.";
  }
  if (reason.includes("account-unavailable")) {
    return "This streak can't start right now.";
  }
  const code = String((err as { code?: unknown })?.code ?? "");
  if (code.endsWith("resource-exhausted")) {
    return "Too many attempts. Try again in a few minutes.";
  }
  return START_FAILED_FALLBACK;
}
