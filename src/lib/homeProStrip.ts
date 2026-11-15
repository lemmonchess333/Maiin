/**
 * When Home shows its Pro strip to a free account.
 *
 * With the trial living at checkout (Sub1a pin 3), Home is where a free
 * account spends its time, and it carried no way back to Pro unless the
 * account had held the old free week, a gap the trial change opened.
 *
 * The strip shows for a free account once its plan is a few days old, and
 * never on its first Home visit: a new account's first days are for its
 * first sessions, and Home should not open on an offer. The plan's age
 * counts from setup (`onboardingCompletedAt`), or from sign-up for an
 * account set up before setup was stamped. The strip stays snoozeable for
 * a month, uid-scoped. Never during a live trial of either kind, and never
 * for Pro.
 *
 * One rule for every account since the older first-week journey went
 * (App1, whole-app grill Q27); it is the one that journey's replacement
 * kept.
 */
export const HOME_PRO_STRIP_MIN_ACCOUNT_AGE_DAYS = 3;

export interface HomeProStripInput {
  isPro: boolean;
  isInTrial: boolean;
  snoozed: boolean;
  /** profile.createdAt in epoch ms, or null before it resolves. */
  createdAtMs: number | null;
  /** The server's setup-completion stamp in epoch ms, or null when the
   *  account was set up before setup was stamped. */
  onboardingCompletedAtMs: number | null;
  /** Snapshot from when this Home visit began, scoped to the signed-in uid. */
  hadPriorHomeVisit: boolean;
  nowMs: number;
}

export function shouldShowHomeProStrip(input: HomeProStripInput): boolean {
  if (input.isPro || input.isInTrial || input.snoozed) return false;
  if (!input.hadPriorHomeVisit) return false;
  const startMs = input.onboardingCompletedAtMs ?? input.createdAtMs;
  if (startMs === null) return false;
  const ageDays = (input.nowMs - startMs) / 864e5;
  return ageDays >= HOME_PRO_STRIP_MIN_ACCOUNT_AGE_DAYS;
}
