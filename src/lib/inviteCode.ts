/**
 * A person's invite code (Soc15): eight characters a friend can read out,
 * type during setup, or receive in a link. The server makes and checks
 * every code (functions/lib/inviteCodes.js); this is the app's copy of its
 * shape, so a typed code is read the way the server will read it, and of
 * the 14 days a new account has to use one. `inviteCode.cross.test.ts`
 * pins the two copies equal.
 */

/** No 0, O, 1, I, L or U: a code reads the same spoken, typed or texted. */
export const INVITE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

export const INVITE_CODE_LENGTH = 8;

/** How long after signing up an account may use an invite. */
export const INVITE_WINDOW_DAYS = 14;

const DAY_MS = 86_400_000;

/** The code as stored (upper case, no spaces or dashes), or null when what
 *  was typed cannot be one. */
export function normaliseInviteCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 32) return null;
  const code = input.replace(/[\s-]/g, "").toUpperCase();
  if (code.length !== INVITE_CODE_LENGTH) return null;
  for (const ch of code) {
    if (!INVITE_CODE_ALPHABET.includes(ch)) return null;
  }
  return code;
}

/** A code grouped for reading: K7P49M2H → K7P4-9M2H. */
export function formatInviteCode(code: string): string {
  return code.length === INVITE_CODE_LENGTH
    ? `${code.slice(0, 4)}-${code.slice(4)}`
    : code;
}

/** Whether an account made at `createdAtMs` may still use an invite. */
export function isWithinInviteWindow(
  createdAtMs: number,
  nowMs: number
): boolean {
  return (
    Number.isFinite(createdAtMs) &&
    Number.isFinite(nowMs) &&
    nowMs - createdAtMs <= INVITE_WINDOW_DAYS * DAY_MS
  );
}
