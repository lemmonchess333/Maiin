/**
 * Central scheduled-run status helpers · PR-0b-iii · spec v7.
 *
 * Single source of truth for "what can the user do with this
 * runDay?" — startable / editable / terminal / reconciliation.
 *
 * Pre-PR-0b-iii, every consumer site did its own inline check:
 *   - `!rd.completed` — used to find pickable runs. Wrong for
 *     skipped runs (they have completed=false).
 *   - `rd.status ?? "planned"` — used by writers. Wrong for
 *     legacy completed:true + status:undefined docs (treats them
 *     as planned, so re-completing slips past the transition gate).
 *   - `status !== "planned" && status !== "race_completed_unlinked"`
 *     — used by overrideRunDay + Week-tab overflow. The race
 *     carve-out was reasonable but open-coded in two places and
 *     gave race_completed_unlinked rows Start/Change/Skip
 *     buttons when the only sensible UX is "pending link".
 *
 * Helpers project the ScheduledRunStatus enum into the four
 * decisions the UI actually needs to make:
 *
 *   - getScheduledRunStatus: legacy-completed-aware status read
 *   - isScheduledRunStartable: can the user launch a Run flow?
 *   - isScheduledRunEditable:  can the user swap template / type?
 *   - isScheduledRunTerminal:  is the slot resolved (any outcome)?
 *   - isScheduledRunReconciliation: pending-link from another source?
 *   - isScheduledRunCompleted: did the run actually happen on plan?
 *
 * Pure module: types only at compile time, no runtime imports
 * beyond constants. Safe to consume from useProgram (which
 * already imports programTypes), from pure helpers, and from
 * components without creating cycles.
 */

import type { ScheduledRunDay, ScheduledRunStatus } from "@/features/program/programTypes";

/**
 * Effective status of a ScheduledRunDay. Resolves legacy docs
 * that have `completed: true` but no `status` field to
 * `completed_exact` — the same resolution the migration applies
 * on read (see src/features/program/migrations.ts). Exposed
 * here for any caller that hasn't gone through the migration
 * path yet (e.g. an analytics surface that reads a raw doc).
 *
 *   status present                          → return it
 *   status missing + completed: true        → "completed_exact"
 *   status missing + completed: false       → "planned"
 *   status missing + completed: undefined   → "planned" (defensive)
 */
export function getScheduledRunStatus(rd: ScheduledRunDay): ScheduledRunStatus {
  if (rd.status) return rd.status;
  return rd.completed ? "completed_exact" : "planned";
}

/**
 * Terminal states: the slot is resolved — the run either
 * happened, was skipped, or was missed at the race. The slot
 * can no longer be started, edited, or reconciled. Distinct
 * from `race_completed_unlinked`, which is a pending-link
 * reconciliation state.
 */
const TERMINAL_STATUSES: ReadonlySet<ScheduledRunStatus> = new Set([
  "completed_exact",
  "completed_modified",
  "completed_late",
  "skipped",
  "race_no_show",
]);

export function isScheduledRunTerminal(status: ScheduledRunStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * Startable = the user can launch a Run flow against this slot.
 * Only `planned` qualifies. Terminal states refuse (the run
 * already happened or was skipped). Reconciliation refuses
 * (a race run was logged separately; the link will resolve
 * the slot, not a fresh attempt).
 */
export function isScheduledRunStartable(status: ScheduledRunStatus): boolean {
  return status === "planned";
}

/**
 * Editable = the user can swap the template / change the run
 * type via in-place edits (Week tab overflow, ProgrammeRunSection
 * per-day list). Only `planned` qualifies. Reconciliation is
 * not "normally editable" — if a future reconciliation UI
 * lands it will dispatch through a dedicated linking path, not
 * the shared template editor.
 */
export function isScheduledRunEditable(status: ScheduledRunStatus): boolean {
  return status === "planned";
}

/**
 * Reconciliation = the run happened separately and is waiting
 * to be linked to this scheduled slot. Today the only value is
 * `race_completed_unlinked` (a race-day GPS run that wasn't
 * automatically linked to the race-prep slot). The helper
 * exists so future additions to the reconciliation family
 * don't have to be searched-and-replaced.
 */
export function isScheduledRunReconciliation(status: ScheduledRunStatus): boolean {
  return status === "race_completed_unlinked";
}

/**
 * Completed status set — runs that actually happened on plan.
 * Shared with `migrations.ts` so the alignment of
 * `completed: boolean` with `status` enum has one source of
 * truth. `race_completed_unlinked` is intentionally NOT in this
 * set: it's pending-link, not done.
 */
export const COMPLETED_STATUSES: ReadonlySet<ScheduledRunStatus> = new Set([
  "completed_exact",
  "completed_modified",
  "completed_late",
]);

export function isScheduledRunCompleted(status: ScheduledRunStatus): boolean {
  return COMPLETED_STATUSES.has(status);
}
