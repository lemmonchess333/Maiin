/**
 * Why a meet-up was refused, in the person's words (Run26 call 4).
 *
 * The `circleMeetup` callable refuses with short server messages
 * (functions/lib/circleMeetups.js) that were not written for anyone, so
 * they are translated here, as `joinRejection.ts` does for joining. A
 * block is not named: saying "you can’t join this one" tells the person
 * nothing the block exists to withhold.
 */
import {
  isRestrictedRefusal,
  RESTRICTED_TOAST,
} from "@/lib/accountRestriction";
import { MEETUPS_AHEAD_MAX } from "./circleMeetups";

const BY_MESSAGE: [needle: string, copy: string][] = [
  [
    "objectionable",
    "This meet-up contains objectionable language. Reword it and try again.",
  ],
  [
    "too many planned",
    `This circle has ${MEETUPS_AHEAD_MAX} meet-ups planned. Call one off first.`,
  ],
  ["circle has ended", "This circle has ended."],
  ["meet-up is over", "This meet-up is over."],
  ["no such meet-up", "This meet-up was called off."],
  ["starts in the past", "Choose a time that hasn’t passed."],
  ["starts too far ahead", "Plan it within the next two months."],
  ["blocked-pair", "You can’t join this meet-up."],
  ["not a member", "You’re no longer in this circle."],
  ["pace groups too long", "Shorten the pace groups."],
];

const BY_CODE: [suffix: string, copy: string][] = [
  ["resource-exhausted", "Too many changes. Try again in a few minutes."],
];

export const MEETUP_FAILED_FALLBACK = "Couldn’t save that. Try again.";

export function describeMeetupRejection(err: unknown): string {
  if (isRestrictedRefusal(err)) return RESTRICTED_TOAST;
  const message = String((err as { message?: unknown })?.message ?? "")
    .toLowerCase()
    .trim();
  for (const [needle, copy] of BY_MESSAGE) {
    if (message.includes(needle)) return copy;
  }
  const code = String((err as { code?: unknown })?.code ?? "").toLowerCase();
  for (const [suffix, copy] of BY_CODE) {
    if (code.endsWith(suffix)) return copy;
  }
  return MEETUP_FAILED_FALLBACK;
}
