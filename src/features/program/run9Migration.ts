/**
 * Run9 phase 1 — legacy → Run9 data-model migration (pure logic).
 *
 * Encodes the locked migration (Run9 ENG (c) + the round-2/3 refinements) as a
 * pure transform so the actual on-read/one-shot migration writer just applies
 * the patch this returns. Not yet invoked anywhere — the writer wiring is a
 * later step under the emulator verifier.
 *
 * Legacy model: `profile.runMode ∈ {freeform, structured, race_prep}` is a
 * user toggle; `programState.runPlan.raceGoal` is a second copy of the race
 * goal (the divergence bug); `structured` users carry auto-assigned
 * `runDays`. Run9 model: `runMode` is MATERIALIZED from `raceGoal` presence,
 * there is no user-facing `structured`, and `runPlan.raceGoal` is a re-derived
 * mirror of the canonical `profile.raceGoal`.
 *
 * Rules:
 *  1. Canonical raceGoal = `profile.raceGoal` ?? `runPlan.raceGoal` (backfill
 *     from the mirror so a legacy race_prep user whose goal only lived on
 *     runPlan isn't dropped).
 *  2. `runMode` is re-materialized via `deriveRunMode(canonicalRaceGoal)` —
 *     presence-based, never the stored toggle. A past-dated raceGoal stays
 *     race_prep; the runtime no-show / recovery flow owns the past-race case.
 *  3. Legacy `structured` with NO race → freeform, and its orphaned
 *     auto-assigned `runDays` are WIPED (they're meaningless without a plan;
 *     leaving them is the zombie-data risk round 2 flagged).
 *  4. `runPlan.raceGoal` is rewritten to equal the canonical goal (mirror
 *     re-derive) — or the runPlan is cleared when there's no race.
 */

import {
  deriveRunMode,
  type RaceGoal,
  type RunMode,
} from "./runModeResolution";

export interface LegacyProfileRunFields {
  runMode?: string | null;
  raceGoal?: RaceGoal | null;
}

export interface LegacyRunPlan {
  mode?: string;
  raceGoal?: RaceGoal | null;
  phase?: string | null;
  recoveryEndDate?: string | null;
  completedRaces?: string[];
  [k: string]: unknown;
}

export interface LegacyProgramRunState {
  runPlan?: LegacyRunPlan | null;
  runDays?: unknown[] | null;
}

export interface Run9MigrationResult {
  /** Patch for `users/{uid}` — always materializes runMode. */
  profilePatch: { runMode: RunMode; raceGoal: RaceGoal | null };
  /** Patch for `programState/current`. `runDays: []` means WIPE. */
  programStatePatch: {
    runPlan: LegacyRunPlan | null;
    /** present only when runDays must be wiped (structured→freeform). */
    runDays?: never[];
  };
  /** True when the input was already Run9-consistent (no write needed). */
  noop: boolean;
}

function canonicalRaceGoal(
  profile: LegacyProfileRunFields,
  runPlan: LegacyRunPlan | null | undefined
): RaceGoal | null {
  if (profile.raceGoal) return profile.raceGoal;
  if (runPlan && runPlan.raceGoal) return runPlan.raceGoal;
  return null;
}

export function migrateRunStateToRun9(
  profile: LegacyProfileRunFields,
  program: LegacyProgramRunState
): Run9MigrationResult {
  const runPlan = program.runPlan ?? null;
  const race = canonicalRaceGoal(profile, runPlan);
  const runMode = deriveRunMode(race);

  if (race) {
    // Race overlay survives. Re-derive the runPlan.raceGoal mirror to the
    // canonical goal; preserve recovery sub-state if present.
    const nextRunPlan: LegacyRunPlan = {
      ...(runPlan ?? {}),
      mode: "race_prep",
      raceGoal: race,
    };
    const noop =
      profile.runMode === "race_prep" &&
      !!profile.raceGoal &&
      !!runPlan &&
      runPlan.raceGoal != null &&
      runPlan.raceGoal.targetDate === race.targetDate &&
      runPlan.raceGoal.distance === race.distance;
    return {
      profilePatch: { runMode, raceGoal: race },
      programStatePatch: { runPlan: nextRunPlan },
      noop,
    };
  }

  // No race → freeform. If the user was legacy `structured`, its auto-assigned
  // runDays + runPlan are orphaned: wipe them.
  const wasStructured = profile.runMode === "structured";
  const hadRunDays = Array.isArray(program.runDays) && program.runDays.length > 0;
  const alreadyFreeform =
    (profile.runMode === "freeform" || profile.runMode == null) &&
    profile.raceGoal == null &&
    runPlan == null &&
    !hadRunDays;

  return {
    profilePatch: { runMode: "freeform", raceGoal: null },
    programStatePatch:
      wasStructured || hadRunDays || runPlan
        ? { runPlan: null, runDays: [] }
        : { runPlan: null },
    noop: alreadyFreeform,
  };
}
