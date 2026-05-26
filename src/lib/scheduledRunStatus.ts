/**
 * Central scheduled-run status helpers · PR-0b-iii (PR-D revision).
 *
 * Single source of truth for "what can the user do with this
 * runDay?" — startable / editable / terminal / completed.
 *
 * Helpers project the ScheduledRunStatus enum into the decisions
 * the UI actually needs to make:
 *
 *   - getScheduledRunStatus: legacy-completed-aware status read
 *   - isScheduledRunStartable: can the user launch a Run flow?
 *   - isScheduledRunEditable:  can the user swap template / type?
 *   - isScheduledRunTerminal:  is the slot hard-resolved (can't
 *                              accept any further transition)?
 *   - isScheduledRunCompleted: did the run actually happen on plan?
 *
 * PR-D removed `isScheduledRunReconciliation` along with the
 * `race_completed_unlinked` status — both were paper (never
 * written, never reached). The reconciliation pattern lives in
 * RunSummary's reconciliation UI, which writes `completed_exact`
 * directly via completeRunDay; the unlinked intermediate state was
 * never necessary.
 *
 * PR-D also softened `race_no_show`: it's no longer in
 * `TERMINAL_STATUSES` because the auto-transition in useProgram's
 * load effect writes it as an INFERRED state ("we guessed you
 * no-showed after 3 days of silence"). If the user later logs the
 * race via reconciliation, race_no_show → completed_* is legal.
 * race_no_show remains startable=false / editable=false in the
 * day-to-day sense, but it's not hard-terminal.
 *
 * Pure module: types only at compile time, no runtime imports
 * beyond constants. Safe to consume from useProgram (which
 * already imports programTypes), from pure helpers, and from
 * components without creating cycles.
 */

import type {
  LegacyScheduledRunStatus,
  ScheduledRunDay,
  ScheduledRunStatus,
} from "@/features/program/programTypes";

/** Convenience alias — the union of all status values readers may
 *  encounter on a runDay. Active values (PR-J Q4 P59) plus legacy
 *  values preserved per Q1 P8.
 *
 *  Exported so cross-feature consumers (streaks, PI, badges,
 *  scheduler) can type their signatures against the same surface
 *  the helper produces. */
export type AnyScheduledRunStatus =
  | ScheduledRunStatus
  | LegacyScheduledRunStatus;

/**
 * Effective status of a ScheduledRunDay. Resolves legacy docs
 * that have `completed: true` but no `status` field to
 * `completed_exact` — the same resolution the migration applies
 * on read (see src/features/program/migrations.ts). Exposed
 * here for any caller that hasn't gone through the migration
 * path yet (e.g. an analytics surface that reads a raw doc).
 *
 *   status present                          → return it (may be legacy)
 *   status missing + completed: true        → "completed_exact"
 *   status missing + completed: false       → "planned"
 *   status missing + completed: undefined   → "planned" (defensive)
 *
 * PR-J Q8 P103: return type widened to the union so consumers see
 * the legacy values rather than getting silently narrowed.
 */
export function getScheduledRunStatus(
  rd: ScheduledRunDay
): AnyScheduledRunStatus {
  if (rd.status) return rd.status;
  return rd.completed ? "completed_exact" : "planned";
}

/**
 * Returns true when `status` is one of the legacy completed values
 * — `completed_exact`, `completed_modified`, or `completed_late`.
 *
 * PR-J Q8 P103: load-bearing for the derivation in Q2 P27. Readers
 * use this to short-circuit legacy runDays in the completion check
 * without inlining the three-string OR across N call sites.
 *
 * Boolean `completed: true` on pre-status legacy docs is handled
 * at the caller boundary via `getScheduledRunStatus` (which maps
 * it to `completed_exact`), so this helper only needs to compare
 * status strings.
 */
export function isLegacyCompleted(
  status: AnyScheduledRunStatus | undefined
): boolean {
  return (
    status === "completed_exact" ||
    status === "completed_modified" ||
    status === "completed_late"
  );
}

/**
 * Hard terminal states: the slot is resolved and cannot accept
 * any further transition. PR-D removed `race_no_show` from this
 * set — that status is recoverable via the reconciliation flow
 * (race_no_show → completed_*). Terminal here means
 * "no legal outgoing transition exists at all".
 *
 * PR-J Q8 P104: typed as the union — `skipped` is the only active
 * terminal pre-PR-J (PR-J Q1 P7 will add `skipped → planned` later);
 * the three legacy values are terminal forever.
 */
const TERMINAL_STATUSES: ReadonlySet<AnyScheduledRunStatus> =
  new Set<AnyScheduledRunStatus>([
    "completed_exact",
    "completed_modified",
    "completed_late",
    "skipped",
  ]);

export function isScheduledRunTerminal(status: AnyScheduledRunStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * Startable = the user can launch a Run flow against this slot.
 * Only `planned` qualifies. Terminal states refuse (the run
 * already happened or was skipped). `race_no_show` also refuses
 * — although the status is recoverable via reconciliation, the
 * day-to-day "start a fresh run flow against this slot" semantic
 * doesn't apply; the user logs the race retrospectively via a
 * regular saved-run flow, which then reconciles.
 *
 * PR-J Q8 P104: signature widened to the union so callers passing
 * legacy values get a clean `false` without narrowing first.
 */
export function isScheduledRunStartable(
  status: AnyScheduledRunStatus
): boolean {
  return status === "planned";
}

/**
 * Editable = the user can swap the template / change the run
 * type via in-place edits (ProgrammeRunSection per-day list,
 * DayActionSheet). Only `planned` qualifies.
 */
export function isScheduledRunEditable(status: AnyScheduledRunStatus): boolean {
  return status === "planned";
}

/**
 * Completed status set — runs that actually happened on plan.
 * Shared with `migrations.ts` so the alignment of
 * `completed: boolean` with `status` enum has one source of
 * truth.
 *
 * PR-J Q8 P102: typed as `LegacyScheduledRunStatus` — these three
 * values are exactly the legacy completed values; the active
 * union (planned / skipped / race_no_show) has no completed
 * member post-PR-J (completion is derived per Q1 + Q2).
 */
export const COMPLETED_STATUSES: ReadonlySet<LegacyScheduledRunStatus> =
  new Set<LegacyScheduledRunStatus>([
    "completed_exact",
    "completed_modified",
    "completed_late",
  ]);

export function isScheduledRunCompleted(
  status: AnyScheduledRunStatus
): boolean {
  return isLegacyCompleted(status);
}
