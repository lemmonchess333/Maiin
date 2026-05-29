/**
 * Run9 phase-3 Slice A — completion-carry across race-plan regen.
 *
 * The lock (phase-3 / Run9c): "any compress/shift/regen that changes
 * templateId or week boundaries must CARRY status for not-yet-elapsed days
 * across regen (else the default Realign button orphans completions)."
 *
 * There are TWO completion truths in the run model and they survive a regen
 * differently:
 *
 *   1. Claim-by-date+bucket (saved GPS runs) — `computeClaims`
 *      (scheduledRunCompletion.ts) matches a saved run to a runDay by DATE +
 *      quality/easy bucket, never by id/templateId. So a real run that claimed
 *      a slot still claims the regenerated slot on the same date — survives
 *      automatically, nothing to carry here.
 *
 *   2. `runDay.status` (terminal: completed_* / skipped / race_no_show) AND
 *      `manualCompletions[id]` — both key off the runDay id, where
 *      `id = runday_{weekKey}_{dayIndex}_{templateId}` (generateScheduledRunId).
 *      A regen that rewrites a day's templateId (e.g. a compress drops a build
 *      day to easy) or moves its dayIndex mints a NEW id for the SAME calendar
 *      date — and `generateRacePlanV2` emits every day as fresh `planned`. So
 *      the terminal status is lost and `manualCompletions[oldId]` is orphaned.
 *
 * This helper carries BOTH (2) facets across a regen, joining old → new by
 * DATE (mirroring the claim-map philosophy: date selects the slot). It is a
 * pure function — no I/O, idempotent when ids are unchanged (old id === new id
 * for a stable date → same key, value preserved).
 */

import type {
  ScheduledRunDay,
  ScheduledRunStatus,
  LegacyScheduledRunStatus,
  ManualCompletion,
} from "@/features/program/programTypes";

type AnyRunStatus = ScheduledRunStatus | LegacyScheduledRunStatus;

/** Statuses that represent a resolved (non-planned) day worth carrying. A
 *  regenerated week is all `planned`; only these warrant re-stamping onto the
 *  new same-date day so the user's record (✅ / skipped / no-show) survives.
 *  Spans both the active union (skipped / race_no_show) and the legacy
 *  completed_* union (which post-PR-J code keeps readable forever). */
const TERMINAL_STATUSES: ReadonlySet<AnyRunStatus> = new Set<AnyRunStatus>([
  "completed_exact",
  "completed_modified",
  "completed_late",
  "skipped",
  "race_no_show",
]);

export interface CompletionCarryResult {
  /** newRunDays with terminal status re-stamped onto same-date days. */
  runDays: ScheduledRunDay[];
  /** manualCompletions re-keyed from old ids to the new same-date ids. */
  manualCompletions: Record<string, ManualCompletion>;
}

/**
 * Carry terminal status + manual completions from a pre-regen plan onto a
 * freshly-regenerated plan, joining by calendar date.
 *
 * - Terminal status: for each new day whose date had a TERMINAL old day, the
 *   old status (+ its `completed` flag) is re-stamped. Planned old days carry
 *   nothing (the new day stays planned). A date that's gone from the new plan
 *   simply drops out (the day no longer exists).
 * - manualCompletions: re-keyed old-id → new-id by date. An entry whose date
 *   is gone from the new plan is genuinely orphaned and dropped. An entry whose
 *   key isn't in `oldRunDays` at all (a pre-existing orphan we can't map to a
 *   date) is preserved as-is — we never silently discard data we can't reason
 *   about.
 */
export function carryCompletionsAcrossRegen(
  oldRunDays: ScheduledRunDay[],
  newRunDays: ScheduledRunDay[],
  oldMap: Record<string, ManualCompletion> | undefined
): CompletionCarryResult {
  // date → first old runDay on that date (a single-run-per-day plan has one,
  // but guard against dupes by taking array-order first).
  const oldByDate = new Map<string, ScheduledRunDay>();
  for (const rd of oldRunDays) {
    if (rd.date && !oldByDate.has(rd.date)) oldByDate.set(rd.date, rd);
  }

  // Re-stamp terminal status onto same-date new days.
  const runDays = newRunDays.map((rd) => {
    if (!rd.date) return rd;
    const prior = oldByDate.get(rd.date);
    if (prior && prior.status && TERMINAL_STATUSES.has(prior.status)) {
      return {
        ...rd,
        status: prior.status,
        completed: prior.completed ?? rd.completed,
      };
    }
    return rd;
  });

  // Re-key manualCompletions by date.
  const map = oldMap ?? {};
  const carried: Record<string, ManualCompletion> = {};
  if (Object.keys(map).length > 0) {
    const newIdByDate = new Map<string, string>();
    for (const rd of runDays) {
      if (rd.date && rd.id && !newIdByDate.has(rd.date)) {
        newIdByDate.set(rd.date, rd.id);
      }
    }
    const dateByOldId = new Map<string, string>();
    for (const rd of oldRunDays) {
      if (rd.id && rd.date) dateByOldId.set(rd.id, rd.date);
    }
    for (const [oldId, completion] of Object.entries(map)) {
      const date = dateByOldId.get(oldId);
      if (!date) {
        // Key not in oldRunDays — a pre-existing orphan we can't map. Preserve
        // rather than silently drop.
        carried[oldId] = completion;
        continue;
      }
      const newId = newIdByDate.get(date);
      if (newId) carried[newId] = completion;
      // else: date gone from the new plan → genuinely orphaned → drop.
    }
  }

  return { runDays, manualCompletions: carried };
}
