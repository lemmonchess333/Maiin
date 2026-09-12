import type { ProgramState, ScheduledRunDay } from "./programTypes";
import {
  addLocalDays,
  dateForDayOfWeek,
  generateScheduledRunId,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";

/** v4 changes calendar labels and identities, never programme content.
 * A Sunday programme anchor maps FORWARD one day to the Monday sharing
 * six days with that week. Re-bucketing that Sunday as an activity date
 * would move it backward and trigger an unearned rollover on first open.
 * Individual runs do use their actual dates, including a Sunday that now
 * belongs to the preceding week. The programme anchor is independent.
 */
export function migrateMondayWeek(
  state: ProgramState,
  currentWeekKey: string
): ProgramState {
  if ((state.programSchemaVersion ?? 1) >= 4) return state;

  const oldAnchor = state.liftWeekKey ?? state.runDays?.[0]?.weekKey;
  const liftWeekKey = oldAnchor
    ? localWeekKey(
        addLocalDays(
          parseLocalDate(oldAnchor),
          parseLocalDate(oldAnchor).getDay() === 0 ? 1 : 0
        )
      )
    : currentWeekKey;
  const ids = new Map<string, string>();
  const migrateDay = (
    rd: ScheduledRunDay,
    snapshot = false
  ): ScheduledRunDay => {
    // Preserve dated rows exactly. For a pre-date row, its stored anchor
    // names the OLD calendar; using Monday offsets against it shifts dates.
    const oldWeekKey = rd.weekKey ?? oldAnchor;
    const date =
      rd.date ??
      (oldWeekKey
        ? localDateString(
            addLocalDays(
              parseLocalDate(oldWeekKey),
              parseLocalDate(oldWeekKey).getDay() === 0
                ? rd.dayIndex
                : (rd.dayIndex - 1 + 7) % 7
            )
          )
        : dateForDayOfWeek(currentWeekKey, rd.dayIndex));
    const dayIndex = parseLocalDate(date).getDay();
    const weekKey = localWeekKey(parseLocalDate(date));
    const id =
      (snapshot && rd.id ? ids.get(rd.id) : undefined) ??
      generateScheduledRunId({ dayIndex, templateId: rd.templateId }, weekKey);
    if (rd.id && !snapshot) ids.set(rd.id, id);
    // A moved run's old ID encodes its ORIGINAL date, so it cannot safely
    // be reconstructed from its current date. Retain the exact alias for
    // saved links and an interrupted run's persisted configuration.
    const legacyIds =
      rd.id && rd.id !== id
        ? [...new Set([...(rd.legacyIds ?? []), rd.id])]
        : rd.legacyIds;
    return {
      ...rd,
      date,
      dayIndex,
      weekKey,
      id,
      ...(legacyIds ? { legacyIds } : {}),
    };
  };
  const runDays = state.runDays?.map((rd) => migrateDay(rd));
  // Undo stashes join by ID, even if the run has since moved or changed
  // template. Reuse the active row's mapping rather than minting a second ID.
  const deloadSnapshot = state.deloadSnapshot?.runDays
    ? {
        ...state.deloadSnapshot,
        runDays: state.deloadSnapshot.runDays.map((rd) => migrateDay(rd, true)),
      }
    : state.deloadSnapshot;
  const easeSnapshot = state.easeSnapshot
    ? {
        ...state.easeSnapshot,
        runDays: state.easeSnapshot.runDays.map((rd) => migrateDay(rd, true)),
      }
    : undefined;

  const manualCompletions = state.manualCompletions
    ? Object.fromEntries(
        Object.entries(state.manualCompletions).map(([id, completion]) => [
          ids.get(id) ?? id,
          completion,
        ])
      )
    : undefined;
  const completedRaces = state.runPlan?.completedRaces?.map(
    (id) => ids.get(id) ?? id
  );

  return {
    ...state,
    liftWeekKey,
    ...(runDays ? { runDays } : {}),
    ...(deloadSnapshot ? { deloadSnapshot } : {}),
    ...(easeSnapshot ? { easeSnapshot } : {}),
    ...(manualCompletions ? { manualCompletions } : {}),
    ...(completedRaces
      ? { runPlan: { ...state.runPlan!, completedRaces } }
      : {}),
  };
}
