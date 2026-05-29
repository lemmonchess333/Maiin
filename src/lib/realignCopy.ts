/**
 * Run9 phase-3 (Slice DE) — copy for the Realign result toast.
 *
 * Realign re-anchors a race plan to today (keeping the race date) and the
 * generator returns a `RaceTiming` (healthy / compressible / below-floor). Both
 * call sites — the Home `FellBehindSheet` and the in-tab Realign banner — show
 * the same toast, so the copy lives here as one pure, tested function.
 *
 * The below-floor (finish-safely) message is a FIXED honest line (locked
 * 2026-05-29: no fitness-signal branching — cold-start runners, the most common
 * below-floor case, have no signal anyway). It names the risk plainly rather
 * than presenting a doomed compressed plan as normal.
 */

import type { RaceTiming } from "@/features/program/runScheduler";

type RaceDistance = "5k" | "10k" | "half" | "marathon";

const DISTANCE_LABEL: Record<RaceDistance, string> = {
  "5k": "5K",
  "10k": "10K",
  half: "half marathon",
  marathon: "marathon",
};

export function realignResultMessage(input: {
  timing: RaceTiming;
  distance: RaceDistance;
  totalWeeks: number;
}): string {
  const dist = DISTANCE_LABEL[input.distance];
  switch (input.timing) {
    case "below-floor":
      // Fixed honest finish-safely message (locked 2026-05-29).
      return `Not enough weeks to train safely for your ${dist} — switched to a finish-safely plan: all easy runs, no hard sessions. Aim to finish strong, not to PR.`;
    case "compressible":
      return `Plan realigned — ${input.totalWeeks} weeks to your ${dist}. It's a tighter build, so expect fewer easy weeks.`;
    case "healthy":
    default:
      return `Plan realigned to today — ${input.totalWeeks} weeks to your ${dist}.`;
  }
}
