/**
 * Why renaming a Circle was refused, in the person's words (Run27 call 11).
 *
 * `renameGoalSpace` refuses with short server messages
 * (functions/lib/goalSpaceMembership.js) that were not written for anyone,
 * except the word filter's, which is the display name's sentence and is
 * shown as it is (`OBJECTIONABLE_NAME_MESSAGE`, pinned to the server's by
 * profanityFilterMirror.cross.test.ts). They are translated here, as
 * `joinRejection.ts` does for joining.
 */
import {
  isRestrictedRefusal,
  RESTRICTED_TOAST,
} from "@/lib/accountRestriction";
import { OBJECTIONABLE_NAME_MESSAGE } from "@/lib/objectionableMessages";

const BY_MESSAGE: [needle: string, copy: string][] = [
  ["objectionable language", OBJECTIONABLE_NAME_MESSAGE],
  ["owner only", "Only the circle’s owner can rename it."],
  ["circle inactive", "This circle has ended."],
  ["no such circle", "This circle has ended."],
  ["title required", "Give the circle a name."],
];

const BY_CODE: [suffix: string, copy: string][] = [
  ["resource-exhausted", "Too many changes. Try again in a few minutes."],
];

export const RENAME_FAILED_FALLBACK = "Couldn’t rename it. Try again.";

export function describeRenameRejection(err: unknown): string {
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
  return RENAME_FAILED_FALLBACK;
}
