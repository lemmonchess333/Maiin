/**
 * When Home shows its Pro strip to a free account.
 *
 * With the trial living at checkout (Sub1a pin 3), a free account is one
 * that saw the offer page after onboarding and chose Continue with Free.
 * Home is where they spend their time, and it carried no way back to Pro
 * unless they had held the old free week — a gap the trial change opened.
 *
 * The strip shows for a free account once it is a few days old: the
 * offer page was the first screen they saw, and Home should not repeat
 * it on day one. It also shows straight away to an account whose old
 * free week has lapsed (they know what they lost). The strip stays
 * snoozeable for a month, uid-scoped, as before. Never during a live
 * trial of either kind, and never for Pro.
 */
export const HOME_PRO_STRIP_MIN_ACCOUNT_AGE_DAYS = 3;

export interface HomeProStripInput {
  isPro: boolean;
  isInTrial: boolean;
  snoozed: boolean;
  /** The account held the old onboarding free week (now lapsed). */
  hadFreeWeek: boolean;
  /** profile.createdAt in epoch ms, or null before it resolves. */
  createdAtMs: number | null;
  nowMs: number;
}

export function shouldShowHomeProStrip(input: HomeProStripInput): boolean {
  if (input.isPro || input.isInTrial || input.snoozed) return false;
  if (input.hadFreeWeek) return true;
  if (input.createdAtMs === null) return false;
  const ageDays = (input.nowMs - input.createdAtMs) / 864e5;
  return ageDays >= HOME_PRO_STRIP_MIN_ACCOUNT_AGE_DAYS;
}
