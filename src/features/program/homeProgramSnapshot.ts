import type { UserProfile } from "@/lib/auth";
import { localDateString, localWeekKey } from "@/lib/dateHelpers";
import { getWeeklyRunTarget } from "@/lib/scheduleUtils";
import { isInRecoveryOn } from "@/lib/runPlanResolver";
import { normalizeProgramState, type ProgramState } from "./programTypes";
import {
  backfillWeekScheduleIfMissing,
  migrateProgramState,
} from "./migrations";
import { sameStoredValue } from "./stateTransition";
import { areRaceRunDaysStale, raceIsInFuture } from "./raceRunDaysReconcile";

/** Read/shape repair only. Generation and editing stay in the deferred engine. */
export function homeProgramSnapshot(
  raw: ProgramState | null,
  profile: UserProfile,
  today = localDateString()
) {
  if (!raw) return { programState: null, needsMaintenance: true };
  const week = localWeekKey(new Date(`${today}T12:00:00`));
  const programState = migrateProgramState(
    normalizeProgramState(raw, { primaryGoal: profile.primaryGoal }),
    week
  );
  const runWeek = programState.runDays?.[0]?.weekKey;
  const runOwnsRollover =
    !!profile.runMode && profile.runMode !== "freeform" && !!runWeek;
  const anchor = runOwnsRollover ? runWeek : programState.liftWeekKey;
  const raceRepair =
    profile.runMode === "race_prep" &&
    !!profile.raceGoal &&
    (!programState.runDays ||
      (raceIsInFuture(profile.raceGoal, today) &&
        !isInRecoveryOn(programState.runPlan, today) &&
        runWeek === week &&
        areRaceRunDaysStale({
          runDays: programState.runDays,
          raceGoal: profile.raceGoal,
          weekSchedule: profile.weekSchedule ?? [],
          weeklyRunDays: getWeeklyRunTarget(profile) || 3,
          todayKey: today,
        })));
  return {
    programState,
    needsMaintenance:
      !!backfillWeekScheduleIfMissing(profile) ||
      profile.runMode === "structured" ||
      !sameStoredValue(raw, programState) ||
      !!(anchor && anchor < week) ||
      raceRepair,
  };
}
