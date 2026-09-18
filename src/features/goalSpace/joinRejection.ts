/**
 * Why joining a Circle was refused, in the user's words.
 *
 * `joinGoalSpace` refuses for seven distinguishable reasons, and
 * `mapGoalSpaceError` passes each one's code AND message through to the
 * client untouched. The client threw all of that away: `joinCircle`
 * returned a bare boolean, so every refusal produced one toast that
 * guessed aloud — "The invite may be wrong, or the circle may be full."
 *
 * Two of the seven are actively mis-described by that guess. A caller who
 * trips the 10-per-10-minutes limiter is told to check their code, which
 * is exactly the thing they should stop doing; a caller whose circle was
 * closed is told to look for a typo in a code that is correct.
 *
 * `describeRejection` in `src/lib/callableErrors.ts` is the wrong tool
 * here and it is worth saying why, because it looks like the right one.
 * It forwards a `failed-precondition` message verbatim on the premise
 * that the server wrote that prose for the user. These messages were not
 * written for anyone — "circle full", "circle inactive" — so they need
 * translating rather than forwarding.
 *
 * Matching is on a substring of the message rather than equality. The
 * message reaches the client bare from the callable SDK, but this repo
 * has already met the "FirebaseError: failed-precondition: …" prefixed
 * form (`stripCallablePrefix` exists for it), and a substring survives
 * both shapes.
 *
 * The blocked-pair case deliberately says less than it knows. The server
 * refuses when EITHER party has blocked the other, so naming the block
 * would tell the joiner that someone in that circle blocked them —
 * information the block exists to withhold.
 */

/** Refusals keyed by a distinctive fragment of the server's message. */
const BY_MESSAGE: [needle: string, copy: string][] = [
  [
    "circle full",
    "That circle is full. Someone has to leave before anyone else can join.",
  ],
  ["circle inactive", "That circle has been closed."],
  ["no such circle", "That circle no longer exists."],
  ["bad invite", "That invite code isn't right. Check it and try again."],
  [
    "invite code required",
    "That doesn't look like an invite code. Paste the whole code you were sent.",
  ],
  ["blocked-pair", "You can't join this circle."],
];

/** Refusals that never reach a message worth reading, keyed by code. */
const BY_CODE: [suffix: string, copy: string][] = [
  ["resource-exhausted", "Too many attempts. Try again in a few minutes."],
  ["unauthenticated", "Sign in to join a circle."],
];

/** The fallback. Says a join did not happen and nothing it cannot support. */
export const JOIN_FAILED_FALLBACK = "Couldn't join. Try again in a moment.";

export function describeJoinRejection(err: unknown): string {
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
  return JOIN_FAILED_FALLBACK;
}
