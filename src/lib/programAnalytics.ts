/**
 * Programme-surface analytics — thin event-tracking shim.
 *
 * Same pattern as foodAnalytics.ts / paywallAnalytics.ts: no provider is
 * wired today, so call sites emit structured events from day one through the
 * no-op-safe analyticsClient; when a provider lands, only the client changes.
 *
 * First event set: the Adjust-this-week sheet (Run13 lock acceptance —
 * "records anonymized event metadata for selection, preview, apply, cancel").
 */
import { emit } from "./analyticsClient";

export type ProgramEvent =
  | "adjust_week_opened"
  | "adjust_week_intent_selected"
  | "adjust_week_applied"
  | "adjust_week_cancelled"
  // Run14 ease-week nudge (RUN-05): shown (with the evidence counts),
  // applied (CTA → AdjustWeekSheet), or dismissed. Lets us tell later
  // whether nudges get acted on or waved away.
  | "ease_week_nudge_shown"
  | "ease_week_nudge_applied"
  | "ease_week_nudge_dismissed";

export interface ProgramEventMetadata {
  /** adjust_week_intent_selected/applied: which intent chip. */
  intent?: "not_100" | "crowded" | "easier";
  /** adjust_week_applied: which mutation ran. */
  action?: "easier_week" | "realign";
  /** adjust_week_applied (easier_week): number of days swapped. */
  swapCount?: number;
  /** adjust_week_opened: which entry point. */
  source?: "cockpit" | "settings";
  /** ease_week_nudge_shown: the evidence surfaced in the card. */
  harderCount?: number;
  ratedCount?: number;
}

export function track(
  event: ProgramEvent,
  metadata: ProgramEventMetadata = {}
): void {
  emit("program", event, metadata as Record<string, unknown>);
}
