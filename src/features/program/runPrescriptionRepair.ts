import type { UserProfile } from "@/lib/auth";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { getScheduledRunStatus } from "@/lib/scheduledRunStatus";
import { isScheduledRaceRunDay } from "@/lib/workoutTemplates";
import type { ProgramState, ScheduledRunDay } from "./programTypes";
import { profileNewRunnerUntil } from "./newRunner";
import { starterRunSlots } from "./starterPlan";

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = parseLocalDate(value);
  return Number.isFinite(parsed.getTime()) && localDateString(parsed) === value;
}

/** The existing block, not an experienced runner's lifetime signup age. */
function isBeginnerBlock(state: ProgramState, profile: UserProfile): boolean {
  const plan = state.runPlan;
  if (plan?.mode === "starter") return true;
  if (plan?.mode !== "race_prep") return false;
  const until = profileNewRunnerUntil(profile);
  if (!until) return false;
  const target = plan.raceGoal?.targetDate;
  if (
    validDate(target) &&
    Number.isFinite(plan.totalWeeks) &&
    plan.totalWeeks! > 0
  ) {
    const raceWeek = localWeekKey(parseLocalDate(target));
    return (
      localDateString(
        addLocalDays(
          parseLocalDate(raceWeek),
          -(Math.trunc(plan.totalWeeks!) - 1) * 7
        )
      ) < until
    );
  }
  // A stale stored week must not become a later origin merely because the
  // user opens the app weeks later. Missing anchors are not inferred.
  const storedWeek = state.runDays?.find((day) =>
    validDate(day.weekKey)
  )?.weekKey;
  if (!storedWeek) return false;
  const elapsed = Math.max(0, Math.trunc(plan.currentWeek ?? 0));
  return (
    localDateString(addLocalDays(parseLocalDate(storedWeek), -elapsed * 7)) <
    until
  );
}

/**
 * Repair current prescriptions on load, including weeks whose race template
 * already matches. Never change completed/manual rows, historical dates,
 * stage, race date, or the user's weekly availability.
 * Also usable as a read-only projection while a cached snapshot is painted;
 * transaction bases must remain the raw stored document.
 */
export function repairRunPrescriptions(
  state: ProgramState,
  profile: UserProfile,
  today: string
): ProgramState {
  if (!state.runPlan || !validDate(today)) return state;
  const week = localWeekKey(parseLocalDate(today));
  const rows = state.runDays ?? [];
  const immutable = (day: ScheduledRunDay) =>
    getScheduledRunStatus(day) !== "planned" ||
    !!state.manualCompletions?.[day.id ?? ""] ||
    (validDate(day.date) && day.date < today);
  const plan = state.runPlan;
  if (plan.phase === "recovery" || !isBeginnerBlock(state, profile))
    return state;

  // Today's row may already have a saved activity claim outside this lightweight
  // snapshot. Preserve it rather than orphaning that display during migration.
  const fixedBeginnerRow = (day: ScheduledRunDay) =>
    immutable(day) || (validDate(day.date) && day.date === today);
  const inWeek = (day: ScheduledRunDay) =>
    validDate(day.date) && localWeekKey(parseLocalDate(day.date)) === week;
  const fixed = rows.filter(
    (day) =>
      inWeek(day) && (fixedBeginnerRow(day) || isScheduledRaceRunDay(day))
  );
  const available = new Set(starterRunSlots(profile.weekSchedule ?? []));
  const neighbors = rows.filter(
    (day) => fixedBeginnerRow(day) || isScheduledRaceRunDay(day)
  );
  const besideFixed = (day: ScheduledRunDay) =>
    neighbors.some((other) => {
      if (!validDate(day.date) || !validDate(other.date)) return false;
      return (
        Math.abs(Date.parse(day.date) - Date.parse(other.date)) < 2 * 86400000
      );
    });
  const candidates = rows.filter(
    (day) =>
      inWeek(day) &&
      !fixedBeginnerRow(day) &&
      !isScheduledRaceRunDay(day) &&
      available.has(day.dayIndex) &&
      !besideFixed(day)
  );
  const seenDates = new Set<string>();
  const uniqueCandidates = [...candidates]
    .sort((a, b) => a.date!.localeCompare(b.date!))
    .filter((day) => {
      if (seenDates.has(day.date!)) return false;
      seenDates.add(day.date!);
      return true;
    });
  const fixedDates = new Set(fixed.map((day) => day.date));
  const kept = new Set(
    uniqueCandidates.slice(0, Math.max(0, 3 - fixedDates.size))
  );
  const runDays = rows.filter(
    (day) =>
      fixedBeginnerRow(day) ||
      isScheduledRaceRunDay(day) ||
      (validDate(day.date) && !inWeek(day)) ||
      kept.has(day)
  );
  if (runDays.length === rows.length) return state;
  return {
    ...state,
    runDays,
    ...(runDays.length === 0 && plan.mode === "race_prep"
      ? { runPlan: { ...plan, emptyRunWeekKey: week } }
      : {}),
  };
}
