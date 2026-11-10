/**
 * Invites that carry who sent them (Soc15 calls 4 and 5), the app's side.
 *
 * The server holds everything: a person's code (getInviteCode), whose a
 * code is for the signed-out welcome screen (lookupInvite), and a new
 * account using one (redeemInvite). The inviter follows the new person at
 * once; the new person follows the inviter at once when the inviter takes
 * followers without approving them, and otherwise asks, the request marked
 * as from the invite (Soc15 call 4 and its STATUS line). This file calls them
 * and words their answers: the one line a redemption gets, and a sentence
 * for each refusal. `inviteRefusals.test.ts` pins every reason the server
 * can give (INVITE_REFUSALS in functions/lib/inviteCodes.js) to one here,
 * so a new refusal cannot reach the person as the fallback.
 *
 * An unknown code, a block either way and a restricted or deleting
 * inviter are one reason on the server, so the words cannot say which.
 */
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { INVITE_WINDOW_DAYS, normaliseInviteCode } from "@/lib/inviteCode";
import {
  isRestrictedRefusal,
  RESTRICTED_TOAST,
} from "@/lib/accountRestriction";
import {
  clearPendingInvite,
  pendingInviteUnchanged,
  savePendingInvite,
  snapshotPendingInvite,
  type PendingInviteSnapshot,
} from "@/lib/pendingInvite";
import { toast } from "@/lib/toast";

/** The caller's own code, made the first time they ask. */
export async function fetchMyInviteCode(): Promise<string> {
  const res = await httpsCallable<unknown, { code?: unknown }>(
    functions,
    "getInviteCode"
  )({});
  const code = normaliseInviteCode(res.data?.code);
  if (!code) throw new Error("No invite code came back");
  return code;
}

/** A new code for the caller: the old one stops working at once. */
export async function renewMyInviteCode(): Promise<string> {
  const res = await httpsCallable<unknown, { code?: unknown }>(
    functions,
    "renewInviteCode"
  )({});
  const code = normaliseInviteCode(res.data?.code);
  if (!code) throw new Error("No invite code came back");
  return code;
}

/** What using a code did. */
export interface InviteRedemption {
  /** The inviter's public name, when they have one. */
  inviterName: string | null;
  /** The same invite was used before (a reply lost on the way back). */
  alreadyJoined: boolean;
  /** The inviter approves followers: they follow the person now, and the
   *  person's follow of them waits as a request (Soc15 call 4 and its
   *  STATUS line). False when the two follow each other already. */
  requested: boolean;
}

/** Use `code` for the signed-in account. Rejects with the callable's
 *  error, which `describeInviteRefusal` words. */
export async function redeemInviteCode(
  code: string
): Promise<InviteRedemption> {
  const res = await httpsCallable<
    { code: string },
    { inviterName?: unknown; alreadyJoined?: unknown; requested?: unknown }
  >(
    functions,
    "redeemInvite"
  )({ code });
  const name = res.data?.inviterName;
  return {
    inviterName: typeof name === "string" && name.trim() ? name.trim() : null,
    alreadyJoined: res.data?.alreadyJoined === true,
    requested: res.data?.requested === true,
  };
}

/** The first name behind a code, for the signed-out welcome screen, or
 *  null: no account is needed, and any failure is a null. */
export async function lookupInviterName(code: string): Promise<string | null> {
  try {
    const res = await httpsCallable<
      { code: string },
      { inviter?: { firstName?: unknown } | null }
    >(
      functions,
      "lookupInvite"
    )({ code });
    const name = res.data?.inviter?.firstName;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  } catch {
    return null;
  }
}

/** What a code that cannot be one says, before anything is sent. */
export const NOT_A_CODE =
  "Invite codes are 8 letters and numbers, like ABCD-2345.";

/** What a failed fetch of the person's own code says on a tap. */
export const INVITE_CODE_UNAVAILABLE =
  "Couldn't get your invite code. Check your connection and try again.";

/** The one line a redemption gets: both ways at once, or, when the inviter
 *  approves followers, their follow now and the person's request waiting. */
export function inviteJoinedLine(
  inviterName: string | null,
  requested = false
): string {
  if (requested) {
    return inviterName
      ? `${inviterName} follows you now. Your request to follow them is waiting`
      : "Your friend follows you now. Your request to follow them is waiting";
  }
  return inviterName
    ? `You and ${inviterName} now follow each other`
    : "You and your friend now follow each other";
}

/** Where the person typed the code: setup ends before they can retry, so
 *  its words say where to try again. */
export type InviteSurface = "setup" | "people";

/** Where a new account can enter a code after setup. */
export const ENTER_CODE_LATER =
  "You can enter it again in Social, under Find people.";

/** Every reason the server refuses with, in words. */
export const INVITE_REFUSAL_WORDS: Record<string, string> = {
  "code-not-found":
    "We couldn't find that invite code. Check it with your friend.",
  "own-code": "That's your own invite code. Send it to a friend instead.",
  "already-invited": "You've already joined from an invite.",
  "account-not-new": `Invite codes work in an account's first ${INVITE_WINDOW_DAYS} days. Search for your friend instead.`,
  "invite-limit": "That code has been used a lot today. Try again tomorrow.",
  "setup-unfinished": "Finish setting up first, then use the code.",
  "account-unavailable": "Invites aren't available on this account right now.",
};

/** The fallback: the code was not used, and nothing more is known. */
export const INVITE_FAILED_FALLBACK =
  "Couldn't use the invite code. Check your connection and try again.";

function reasonOf(err: unknown): string | null {
  const details = (err as { details?: unknown })?.details;
  const reason =
    details && typeof details === "object"
      ? (details as { reason?: unknown }).reason
      : undefined;
  return typeof reason === "string" ? reason : null;
}

/** Why a code was not used, in the person's words. */
export function describeInviteRefusal(
  err: unknown,
  surface: InviteSurface
): string {
  if (isRestrictedRefusal(err)) return RESTRICTED_TOAST;
  const reason = reasonOf(err);
  const words = reason ? INVITE_REFUSAL_WORDS[reason] : undefined;
  if (words) {
    return surface === "setup" &&
      (reason === "code-not-found" || reason === "invite-limit")
      ? `${words} ${ENTER_CODE_LATER}`
      : words;
  }
  const code = String((err as { code?: unknown })?.code ?? "");
  if (code.endsWith("resource-exhausted")) {
    return "Too many tries. Wait a few minutes, then try again.";
  }
  return INVITE_FAILED_FALLBACK;
}

/** Whether the server gave an answer about the code itself, so keeping it
 *  on the device for another try would only be refused again. A dropped
 *  connection or a rate limit is not one. */
export function isFinalInviteRefusal(err: unknown): boolean {
  if (isRestrictedRefusal(err)) return true;
  const reason = reasonOf(err);
  return (
    !!reason && reason in INVITE_REFUSAL_WORDS && reason !== "invite-limit"
  );
}

/**
 * Setup's finish: use the code the person left in setup's field, and say
 * what happened in one toast. The plan is already made, so nothing here can
 * stop the person reaching Home. A code the server answered for is
 * forgotten; one that could not be used yet (no connection, too many
 * tries, the inviter's busy day) is kept on the device, so People offers
 * it again.
 */
export async function redeemInviteAfterSetup(
  code: string,
  pending: PendingInviteSnapshot = snapshotPendingInvite()
): Promise<void> {
  try {
    const result = await redeemInviteCode(code);
    clearPendingInvite(pending);
    toast.success(inviteJoinedLine(result.inviterName, result.requested));
  } catch (err) {
    if (isFinalInviteRefusal(err)) clearPendingInvite(pending);
    else if (pendingInviteUnchanged(pending)) savePendingInvite(code);
    toast.error(describeInviteRefusal(err, "setup"));
  }
}
