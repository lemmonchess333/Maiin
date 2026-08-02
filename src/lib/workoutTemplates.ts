export interface RunTemplate {
  id: string;
  name: string;
  type: "easy" | "tempo" | "intervals" | "long" | "race";
  icon: string;
  description: string;
  estimatedDuration: number;
  config: {
    targetPace?: number;
    targetDistanceKm?: number;
    intervals?: {
      reps: number;
      workDistance?: number;
      workDuration?: number;
      restDuration: number;
      warmupDuration?: number;
      cooldownDuration?: number;
    };
  };
}

export const RUN_TEMPLATES: RunTemplate[] = [
  {
    id: "easy_30",
    name: "Easy 30",
    type: "easy",
    icon: "person-standing",
    description: "Conversational pace — recovery day",
    estimatedDuration: 30,
    config: {},
  },
  {
    id: "tempo_20",
    name: "20 Min Tempo",
    type: "tempo",
    icon: "zap",
    description: "5 min warmup → 20 min tempo → 5 min cooldown",
    estimatedDuration: 30,
    config: { targetPace: 270 },
  },
  {
    id: "5x1k",
    name: "5×1K Intervals",
    type: "intervals",
    icon: "refresh-cw",
    description: "5 reps of 1km hard with 90s rest",
    estimatedDuration: 35,
    config: {
      intervals: {
        reps: 5,
        workDistance: 1000,
        restDuration: 90,
        warmupDuration: 300,
        cooldownDuration: 300,
      },
    },
  },
  {
    id: "8x400",
    name: "8×400m Speed",
    type: "intervals",
    icon: "wind",
    description: "8 reps of 400m with 60s rest",
    estimatedDuration: 25,
    config: {
      intervals: {
        reps: 8,
        workDistance: 400,
        restDuration: 60,
        warmupDuration: 300,
        cooldownDuration: 300,
      },
    },
  },
  {
    id: "long_10k",
    name: "Long 10K",
    type: "long",
    icon: "route",
    description: "Easy-to-moderate effort, time on feet",
    estimatedDuration: 55,
    config: { targetDistanceKm: 10 },
  },
  {
    id: "long_15k",
    name: "Long 15K",
    type: "long",
    icon: "route",
    description: "Steady, controlled effort",
    estimatedDuration: 80,
    config: { targetDistanceKm: 15 },
  },
  {
    id: "5k_race",
    name: "5K Race",
    type: "race",
    icon: "flag",
    description: "All-out 5km effort",
    estimatedDuration: 25,
    config: { targetDistanceKm: 5 },
  },
  {
    id: "10k_race",
    name: "10K Race",
    type: "race",
    icon: "flag",
    description: "All-out 10km effort",
    estimatedDuration: 50,
    config: { targetDistanceKm: 10 },
  },
  {
    id: "half_race",
    name: "Half Marathon Race",
    type: "race",
    icon: "flag",
    description: "All-out half-marathon effort",
    estimatedDuration: 110,
    config: { targetDistanceKm: 21.1 },
  },
  {
    id: "marathon_race",
    name: "Marathon Race",
    type: "race",
    icon: "flag",
    description: "All-out marathon effort",
    estimatedDuration: 240,
    config: { targetDistanceKm: 42.2 },
  },
];

/** Canonical race-template gate. Resolves a run template id to its
 *  type and asks "is it a race?" — the id-agnostic check the codebase
 *  standardised on (real ids are `5k_race` … `marathon_race`, NEVER
 *  the literal `"race"`). Several call sites inlined this; prefer this
 *  export. */
export function isRaceTemplateId(id: string | null | undefined): boolean {
  if (!id) return false;
  return RUN_TEMPLATES.find((t) => t.id === id)?.type === "race";
}

/**
 * RUN-RACE-GUARD-01 — a scheduled run day's IMMUTABLE race identity.
 *
 * A race day is generated with `type: "race"`; a user template
 * override (`overrideRunDay`) rewrites `templateId`/`userOverride` but
 * NEVER touches `type`. So `type === "race"` survives an override to an
 * easy template — that is what makes race identity un-erasable. The
 * base `templateId` is a belt-and-suspenders fallback for any legacy
 * day whose `type` string drifted. Writers (`overrideRunDay`,
 * `markManualComplete`) and the day sheet all gate on this so a race
 * cannot be swapped away and then completed as an ordinary run.
 */
export function isScheduledRaceRunDay(rd: {
  type?: string;
  templateId?: string;
}): boolean {
  return rd.type === "race" || isRaceTemplateId(rd.templateId);
}

/* The LIFTING template library that used to live here — `WorkoutTemplate`,
 * `TemplateExercise`, `WORKOUT_TEMPLATES` and its five helpers — was deleted
 * 2026-07-25. It had ZERO production consumers: programme generation runs on
 * `src/features/program/templates.ts`, which defines its own
 * `TemplateExercise` (the name collision is the tell — two independent
 * libraries, one of which won). Only its own tests referenced it.
 *
 * This module is now the RUN template surface, which is live: RUN_TEMPLATES
 * has 42 production references. */
