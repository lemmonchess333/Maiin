/**
 * runConfigDefaults — the single source of truth for "a run config, and
 * how to build one from a type/template".
 *
 * Extracted from RunSetupModal (2026-07, run fast-launch arc) so three
 * surfaces share ONE config-from-type derivation instead of re-deriving it:
 *   - RunSetupModal   (the full form — imports these, re-exports RunConfig)
 *   - RunLaunchCard   (planned one-tap launch)
 *   - RunTilePicker   (freeform one-tap tiles)
 *
 * Everything here is PURE (no React, no hooks, no Firestore) so the
 * builders are unit-testable in isolation. The "tested copy is the running
 * copy" rule: RunSetupModal's Start and the two fast surfaces all produce a
 * config through the SAME functions, so they can't drift.
 */

import type { ActivityType } from "@/types/run";
import type { GuidedRunWorkout } from "@/lib/guidedRun";
import {
  freeformPlanMetadata,
  type RunPlanMetadata,
} from "@/lib/runPlanMetadata";
import { resolveSessionPaces, type PaceTable } from "@/lib/runPaces";
import { sessionPaceDisplay } from "@/lib/runLabels";
import { isVolumeEligible } from "@/lib/runStatsEligibility";

/** The four one-tap direct-launch types, in tile display order. Everything
 *  else (intervals / treadmill / guided / race / route) needs config and
 *  lives behind "More options" → the full modal. Owned here (not in
 *  RunTilePicker) so the repeat-last resolver below and the tile grid can't
 *  drift on what counts as directly launchable. */
export const DIRECT_LAUNCH_TYPES: ActivityType[] = [
  "easy",
  "tempo",
  "long",
  "freerun",
];

/**
 * RUN-04 (RunFast1 deferred follow-up, un-deferred 2026-07-10): the repeat
 * chip's decision rule. Returns the type to offer as "Repeat <type>" when the
 * TWO most recent volume-eligible runs share the same DIRECT-launch type —
 * a recurring habit signal, not a one-off. Anything else (mixed types, fewer
 * than two eligible runs, or a structured type like intervals/treadmill/
 * guided/race that needs the modal) returns null and the picker renders
 * exactly as before. Pure — callers pass runs newest-first.
 */
export function resolveRepeatType(
  runs: Array<{
    activityType?: string;
    distance?: number;
    duration?: number;
    isInvalid?: boolean;
    savedAnyway?: boolean;
  }>
): ActivityType | null {
  const eligible = runs.filter((r) => isVolumeEligible(r));
  if (eligible.length < 2) return null;
  const type = eligible[0].activityType;
  if (!type || eligible[1].activityType !== type) return null;
  return (DIRECT_LAUNCH_TYPES as string[]).includes(type)
    ? (type as ActivityType)
    : null;
}

export interface RunConfig {
  activityType: ActivityType;
  autoPause: boolean;
  audioCues: boolean;
  audioCueFrequency: "every_km" | "every_500m" | "every_5min" | "off";
  paceAlerts: boolean;
  voiceRate: number;
  displayStats: (
    | "pace"
    | "distance"
    | "time"
    | "calories"
    | "elevation"
    | "avgPace"
  )[];
  /**
   * Activity target. `value`'s unit depends on `type` — single
   * canonical contract used by every layer that touches a target:
   *
   *   - "distance": metres            (e.g. 10000 = 10km)
   *   - "time":     seconds           (e.g. 1800  = 30min)
   *   - "pace":     seconds/kilometre (e.g. 270   = 4:30/km)
   *   - "none":     value omitted
   *
   * Bridge layers (e.g. templateToPrefill in `src/lib/runPlanMetadata.ts`)
   * MUST convert their inputs to metres / seconds / s-per-km BEFORE
   * assigning to target.value. Audio-cue consumers in `src/pages/Run.tsx`
   * read target.value as the unit above with no further conversion.
   */
  target: {
    type: "none" | "distance" | "time" | "pace";
    value?: number;
  };
  intervals?: {
    reps: number;
    workDistance?: number;
    workDuration?: number;
    workPace?: number;
    restDuration: number;
    warmupDuration?: number;
    cooldownDuration?: number;
  };
  guidedWorkout?: GuidedRunWorkout;
  shoeId?: string;
  /**
   * Plan-adherence metadata block, Phase B1. Snapshot of the programme
   * context active at Start; persisted to the run doc. Always present
   * (freeform runs get the freeform default shape). See
   * `src/lib/runPlanMetadata.ts` for field semantics.
   */
  planMetadata: RunPlanMetadata;
}

export const DEFAULT_CONFIG: RunConfig = {
  activityType: "easy",
  autoPause: true,
  audioCues: true,
  audioCueFrequency: "every_km",
  paceAlerts: true,
  voiceRate: 0.9,
  displayStats: ["pace", "distance", "time", "calories"],
  target: { type: "none" },
  // Freeform default — Run.tsx overrides this via savedPreferences when
  // programme prefill applies. See computePlanMetadata.
  planMetadata: freeformPlanMetadata("freeform"),
};

/** Fallback interval shape when no config-level intervals exist yet.
 *  Mirrors the pre-extraction `intervalConfig` default in RunSetupModal. */
export const DEFAULT_INTERVAL_CONFIG: NonNullable<RunConfig["intervals"]> = {
  reps: 5,
  workDistance: 1000,
  restDuration: 90,
};

/* Run-type registry. `name` is the long-form label used by the selected-run
   card, the chooser, and the Start CTA. `cardChip` / `chooserChip` carry the
   measurement source; `group` drives the chooser's Outdoor / Other split.
   `'manual'` is deliberately absent — that activityType is set
   programmatically by the GPS-fallback "Track without GPS" path. */
export type ActivityTypeOption = {
  type: ActivityType;
  label: string;
  name: string;
  icon: string;
  cardDescription: string;
  cardChip: string;
  chooserDescription: string;
  chooserChip: string;
  group: "outdoor" | "other";
};

export const ACTIVITY_TYPES: ActivityTypeOption[] = [
  {
    type: "freerun",
    label: "Free",
    name: "Free Run",
    icon: "Footprints",
    cardDescription: "Run at your own pace",
    cardChip: "Outdoor GPS",
    chooserDescription: "Run at your own pace",
    chooserChip: "GPS",
    group: "outdoor",
  },
  {
    type: "easy",
    label: "Easy",
    name: "Easy Run",
    icon: "PersonStanding",
    cardDescription: "Recovery pace",
    cardChip: "Outdoor GPS",
    chooserDescription: "Recovery pace",
    chooserChip: "GPS",
    group: "outdoor",
  },
  {
    type: "tempo",
    label: "Tempo",
    name: "Tempo Run",
    icon: "Zap",
    cardDescription: "Sustained effort",
    cardChip: "Outdoor GPS",
    chooserDescription: "Sustained effort",
    chooserChip: "GPS",
    group: "outdoor",
  },
  {
    type: "intervals",
    label: "Intervals",
    name: "Intervals",
    icon: "RefreshCw",
    cardDescription: "Repeats + rest",
    cardChip: "Outdoor GPS",
    chooserDescription: "Repeats + rest",
    chooserChip: "GPS",
    group: "outdoor",
  },
  {
    type: "long",
    label: "Long",
    name: "Long Run",
    icon: "Route",
    cardDescription: "Distance-focused",
    cardChip: "Outdoor GPS",
    chooserDescription: "Distance-focused",
    chooserChip: "GPS",
    group: "outdoor",
  },
  {
    type: "race",
    label: "Race",
    name: "Race",
    icon: "Flag",
    cardDescription: "All-out effort",
    cardChip: "Outdoor GPS",
    chooserDescription: "All-out effort",
    chooserChip: "GPS",
    group: "outdoor",
  },
  {
    type: "treadmill",
    label: "Treadmill",
    name: "Treadmill",
    icon: "Dumbbell",
    cardDescription: "Indoor",
    cardChip: "Manual distance",
    chooserDescription: "Indoor, manual distance",
    chooserChip: "Manual",
    group: "other",
  },
  {
    type: "guided",
    label: "Guided",
    name: "Guided Run",
    icon: "Headphones",
    cardDescription: "Coach-led workout",
    cardChip: "Audio",
    chooserDescription: "Coach-led workout",
    chooserChip: "Audio",
    group: "other",
  },
];

/**
 * Adaptive Paces — a config patch to personalize a chosen run type from the
 * user's pace table. Tempo → a threshold target pace; Intervals → an interval
 * work pace seeded into the interval config. Other types keep default
 * behaviour. Returns just the activityType when there's no benchmark.
 *
 * Pure version of RunSetupModal's former closure (which read
 * `config.intervals ?? intervalConfig`); `baseIntervals` is that value,
 * defaulting to DEFAULT_INTERVAL_CONFIG.
 */
export function pacePatchForType(
  type: ActivityType,
  paceTable: PaceTable | null,
  baseIntervals: NonNullable<RunConfig["intervals"]> = DEFAULT_INTERVAL_CONFIG
): Partial<RunConfig> {
  if (!paceTable) return { activityType: type };
  if (type === "tempo") {
    const { targetPace } = resolveSessionPaces("tempo", paceTable);
    return targetPace
      ? { activityType: type, target: { type: "pace", value: targetPace } }
      : { activityType: type };
  }
  if (type === "intervals") {
    const { workPace } = resolveSessionPaces("intervals", paceTable);
    return workPace
      ? { activityType: type, intervals: { ...baseIntervals, workPace } }
      : { activityType: type };
  }
  return { activityType: type };
}

/**
 * Adaptive Paces — the personalized pace BAND string for a chooser/tile row
 * (Runna's "range up front"). Null for types with no personal pace
 * (freerun / race / treadmill / guided) or when there's no benchmark.
 */
export function chooserPaceFor(
  type: ActivityType,
  paceTable: PaceTable | null
): string | null {
  if (!paceTable) return null;
  if (
    type !== "easy" &&
    type !== "tempo" &&
    type !== "intervals" &&
    type !== "long"
  ) {
    return null;
  }
  return sessionPaceDisplay(resolveSessionPaces(type, paceTable));
}

/**
 * Build the RunConfig for a planned one-tap launch (RunLaunchCard).
 * Mirrors RunSetupModal's savedPreferences composition VERBATIM so a launch
 * produces a config identical to opening the modal and tapping Start with
 * nothing changed. `handleStart` finalises planMetadata downstream.
 */
export function buildLaunchConfig(
  planDecision: { prefill: Partial<RunConfig>; metadata: RunPlanMetadata },
  audioCuesEnabled: boolean,
  shoeId?: string | null
): RunConfig {
  return {
    ...DEFAULT_CONFIG,
    autoPause: true,
    audioCues: audioCuesEnabled,
    ...planDecision.prefill,
    planMetadata: planDecision.metadata,
    ...(shoeId ? { shoeId } : {}),
  };
}

/**
 * Build the RunConfig for a freeform one-tap tile (RunTilePicker). Same
 * composition, but the type-specific patch comes from pacePatchForType
 * instead of a programme prefill. `planMetadata` is whatever Run.tsx
 * resolved (freeform / rest_day / completed_day shape).
 */
export function buildTileConfig(
  type: ActivityType,
  paceTable: PaceTable | null,
  planMetadata: RunPlanMetadata,
  audioCuesEnabled: boolean,
  shoeId?: string | null
): RunConfig {
  return {
    ...DEFAULT_CONFIG,
    autoPause: true,
    audioCues: audioCuesEnabled,
    ...pacePatchForType(type, paceTable),
    planMetadata,
    ...(shoeId ? { shoeId } : {}),
  };
}
