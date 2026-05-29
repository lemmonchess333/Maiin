/**
 * Run9 phase 2 — freeform hero cadence line.
 *
 * Freeform is the always-on substrate (Run9a): a non-racing user's hero is NOT
 * a target or a progress bar (that would re-introduce the "structure" the model
 * deliberately drops). Instead it carries a single DESCRIPTIVE cadence line —
 * "You've run 3× in the last 4 weeks" — computed client-side from logged runs.
 *
 * Two lock rules constrain this (both from the round-2/3 stress-tests):
 *   - R2-1: descriptive only, never a target / "x of y" progress bar.
 *   - R3-coldstart: at 0 runs the count is meaningless AND judgmental
 *     ("0× in 4 weeks" is the wound we're avoiding). Cold-start is also the
 *     HIGHEST-frequency state across the user base, so it gets its own
 *     invitational variant — and a count is NEVER surfaced as 0.
 *
 * A lapsed runner (logged before, nothing in the window) is its own real
 * segment (design-for-the-user-base): they get a re-invitation, not a bare
 * "0× in 4 weeks".
 *
 * Pure: takes run completion timestamps + a clock, returns a discriminated
 * result. The hero maps each variant to copy; this module owns no JSX.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type FreeformCadence =
  /** No run ever logged — invitational hero, NO count. */
  | { kind: "cold-start" }
  /** Logged runs exist but none in the window — re-invite, NO "0×" count. */
  | { kind: "lapsed"; lastRunDaysAgo: number }
  /** ≥1 run in the window — the descriptive cadence line. */
  | { kind: "cadence"; count: number; weeks: number };

/**
 * @param runCompletedAt completion timestamps of the user's logged runs (any
 *   order; future-dated entries from clock skew are ignored).
 * @param now the reference "now".
 * @param windowWeeks rolling window for the cadence count (default 4).
 */
export function getFreeformCadence(
  runCompletedAt: Date[],
  now: Date,
  windowWeeks = 4
): FreeformCadence {
  const nowMs = now.getTime();
  // Only count runs at-or-before now — a future timestamp (clock skew, bad
  // import) must never inflate the count or masquerade as "most recent".
  const pastMs = runCompletedAt
    .map((d) => d.getTime())
    .filter((t) => Number.isFinite(t) && t <= nowMs);

  if (pastMs.length === 0) return { kind: "cold-start" };

  const windowStartMs = nowMs - windowWeeks * 7 * DAY_MS;
  const inWindow = pastMs.filter((t) => t >= windowStartMs);

  if (inWindow.length === 0) {
    const mostRecent = Math.max(...pastMs);
    return {
      kind: "lapsed",
      lastRunDaysAgo: Math.floor((nowMs - mostRecent) / DAY_MS),
    };
  }

  // count >= 1 here by construction — the R3-coldstart "never a 0× count"
  // guarantee holds without a special case.
  return { kind: "cadence", count: inWindow.length, weeks: windowWeeks };
}
