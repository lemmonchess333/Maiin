/**
 * Which saved run fills which planned run day: the claim map Home, Train
 * and the week's counts read, as a pure function of the plan's run days,
 * the saved runs and the days marked done by hand. `useClaimMapForProgram`
 * subscribes and memoises; this is what it computes, so the training
 * simulator runs the app's own claim map rather than a copy.
 *
 * The rule is `computeClaims` (`scheduledRunCompletion.ts`), which stays
 * template-agnostic; this module supplies what it needs from the catalogue
 * (which templates are quality, which are races, their planned distances)
 * and the pace bar.
 */

import type {
  ManualCompletion,
  ScheduledRunDay,
} from "@/features/program/programTypes";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import {
  computeClaims,
  type ClaimState,
  type CompletionDeps,
  type SavedRunLike,
} from "@/lib/scheduledRunCompletion";
import type { SavedRun } from "@/lib/savedRuns";
import { isVolumeEligible } from "@/lib/runStatsEligibility";

/**
 * Saved-run row as the claim map reads it — the `SavedRunLike` shape
 * the helper consumes, plus the Firestore-shaped extras (duration,
 * type) the UI reads when rendering Q5 "extras" pills. Exported so
 * RunWeekStrip / DayPeekCard / DayActionSheet can type their own
 * extras-display props without importing the shape twice.
 */
export interface SavedRunDoc extends SavedRunLike {
  duration?: number;
  type?: string;
}

/**
 * Pre-computed template-quality lookup. Keyed by `RUN_TEMPLATES[i].id`.
 * `tempo` / `intervals` / `race` are quality; everything else is easy.
 * Q3 P41: helper is template-agnostic — we supply this lookup so the
 * helper doesn't import RUN_TEMPLATES itself.
 */
const TEMPLATE_QUALITY_BUCKET: Record<string, "quality" | "easy"> = (() => {
  const map: Record<string, "quality" | "easy"> = {};
  for (const t of RUN_TEMPLATES) {
    map[t.id] =
      t.type === "tempo" || t.type === "intervals" || t.type === "race"
        ? "quality"
        : "easy";
  }
  return map;
})();

/**
 * Race-template ids, by TYPE. Same construction as the quality lookup
 * above, and injected for the same reason (Q3 P41: the completion helper
 * stays template-agnostic).
 *
 * Never compare against the literal "race" — the real ids are `5k_race`
 * … `marathon_race`, which is exactly the bug this replaces on both sides
 * of the race-day short-circuit.
 */
const RACE_TEMPLATE_IDS: ReadonlySet<string> = new Set(
  RUN_TEMPLATES.filter((t) => t.type === "race").map((t) => t.id)
);

function defaultIsRaceTemplate(templateId: string | undefined): boolean {
  return typeof templateId === "string" && RACE_TEMPLATE_IDS.has(templateId);
}

/**
 * Default pace-bucket classifier. Saved runs with avgPace under
 * 270 sec/km (4:30/km) read as "quality"; otherwise "easy". This
 * is a v1 best-guess; a future PR can pull from `paceTrends.ts`
 * once user-specific baselines are stable.
 */
function defaultPaceBucketFor(saved: SavedRunLike): "quality" | "easy" {
  if (typeof saved.avgPace !== "number") return "easy";
  return saved.avgPace < 270 ? "quality" : "easy";
}

/**
 * Default planned-distance lookup from RUN_TEMPLATES, in METRES.
 *
 * The catalogue authors distances in kilometres (`targetDistanceKm`), but
 * `saved.distance` is metres end-to-end through the run flow (RunSummary.tsx:
 * "`distance` is metres throughout the run flow"). `distanceAndBucketOk`
 * divides one by the other, so this map MUST be metres.
 *
 * It was kilometres until 2026-08-02, which made the ratio 1000× too large
 * and the 70% threshold (PR-J-Q1 pin P2) a no-op: a `long_15k` slot was
 * claimable by a 10.5-METRE run, `marathon_race` by 29.5m. Every fixture in
 * the test file used metres against km templates, so all of them cleared the
 * bar trivially and none asserted a rejection — the same shape as the
 * `templateId === "race"` bug in PR #1775.
 *
 * Returns 0 when the template isn't in the registry (triggers Q1 P29 fallback
 * — date + template-bucket match, distance branch skipped).
 */
const PLANNED_DISTANCE_M_BY_TEMPLATE: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  for (const t of RUN_TEMPLATES) {
    const km = t.config?.targetDistanceKm;
    if (typeof km === "number" && km > 0) {
      map[t.id] = km * 1000;
    }
  }
  return map;
})();

/**
 * Resolve on `userOverride ?? templateId` — a swapped day is the session the
 * user actually chose. Every other resolution site does this
 * (`runPlanMetadata.ts:626`, `runProgrammeViewModel.ts:143`,
 * `adjustWeek.ts:55`, `runHeroState.ts:136`, `raceRunDaysReconcile.ts:62`),
 * and `scheduledRunCompletion.ts:132` resolves the same way for the race
 * short-circuit — so reading `templateId` alone meant a day swapped from
 * `long_15k` to `easy_30` still had to clear the 15K bar.
 */
function defaultPlannedDistanceFor(runDay: {
  templateId?: string;
  userOverride?: string;
}): number {
  const id = runDay.userOverride || runDay.templateId;
  if (!id) return 0;
  return PLANNED_DISTANCE_M_BY_TEMPLATE[id] ?? 0;
}

const DEFAULT_DEPS: CompletionDeps = {
  paceBucketFor: defaultPaceBucketFor,
  templateQualityBucket: TEMPLATE_QUALITY_BUCKET,
  plannedDistanceFor: defaultPlannedDistanceFor,
  isRaceTemplate: defaultIsRaceTemplate,
};

/**
 * A saved run as the completion helper reads it. `date` is the run's day
 * under Lift3 (the day it started), the same day History, the streak and
 * Food count it on. `createdAt` orders claims: a legacy `createdAt` where
 * one exists, else `completedAt`.
 */
function toSavedRunDoc(run: SavedRun): SavedRunDoc {
  return {
    id: run.id,
    date: run.day,
    distance: run.distance,
    avgPace: run.avgPace,
    templateId: run.templateId,
    createdAt: { seconds: run.savedAtSeconds },
    duration: run.duration,
    type: run.type,
  };
}

const NO_SAVED_RUNS: SavedRunDoc[] = [];

/**
 * The saved runs that can fill a planned day, as the claim map reads them.
 * Only runs that count fill a planned day or show as an extra: a run saved
 * anyway counts in no total (`isVolumeEligible`), so it completes no
 * planned run either, and the strip agrees with the week's counts. A
 * planned run done without a run that counts can be marked done by hand.
 * The same empty list every time there are none, for a caller's memo.
 */
export function claimableRuns(runs: readonly SavedRun[]): SavedRunDoc[] {
  const counted = runs.filter((run) => isVolumeEligible(run));
  return counted.length ? counted.map(toSavedRunDoc) : NO_SAVED_RUNS;
}

/** Each planned run day's claim: the saved run that fills it, or a mark
 *  by hand (`computeClaims`). */
export function claimMapFor(
  runDays: ScheduledRunDay[],
  savedRuns: SavedRunDoc[],
  manualCompletions: Record<string, ManualCompletion>,
  today: string
): Map<string, ClaimState> {
  return computeClaims(
    runDays,
    savedRuns,
    manualCompletions,
    today,
    DEFAULT_DEPS
  );
}
