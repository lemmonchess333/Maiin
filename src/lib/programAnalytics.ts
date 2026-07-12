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
  | "adjust_week_cancelled";

export interface ProgramEventMetadata {
  /** adjust_week_intent_selected/applied: which intent chip. */
  intent?: "not_100" | "crowded" | "easier";
  /** adjust_week_applied: which mutation ran. */
  action?: "easier_week" | "realign";
  /** adjust_week_applied (easier_week): number of days swapped. */
  swapCount?: number;
  /** adjust_week_opened: which entry point. */
  source?: "cockpit" | "settings";
}

export function track(
  event: ProgramEvent,
  metadata: ProgramEventMetadata = {}
): void {
  emit("program", event, metadata as Record<string, unknown>);
}
