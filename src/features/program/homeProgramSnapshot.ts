import { repairRunPrescriptions } from "./runPrescriptionRepair";
import type { UserProfile } from "@/lib/auth";
import { localDateString, localWeekKey } from "@/lib/dateHelpers";
import { normalizeProgramState, type ProgramState } from "./programTypes";
import {
  backfillWeekScheduleIfMissing,
  migrateProgramState,
} from "./migrations";
import { sameStoredValue } from "./stateTransition";
import {
  raceWeekNeedsBuilding,
  starterWeekNeedsBuilding,
  weekRolloverAnchor,
} from "./programMaintenance";

/** Read/shape repair only. Generation and editing stay in the deferred
 *  engine; `needsMaintenance` asks the engine's own questions
 *  (programMaintenance.ts) to say when Home has to load it. */
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
  const repaired = repairRunPrescriptions(programState, profile, today);
  const anchor = weekRolloverAnchor(repaired, profile)?.weekKey;
  return {
    programState: repaired,
    needsMaintenance:
      repaired !== programState ||
      !!backfillWeekScheduleIfMissing(profile) ||
      profile.runMode === "structured" ||
      !sameStoredValue(raw, programState) ||
      !!(anchor && anchor < week) ||
      raceWeekNeedsBuilding(programState, profile, today) ||
      starterWeekNeedsBuilding(programState, profile),
  };
}
