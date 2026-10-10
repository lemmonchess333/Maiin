/**
 * runSessionExplainer — the "why this session" line (WAVE1-EXPLAIN,
 * roadmap A5).
 *
 * One honest sentence per scheduled run, derived from facts the plan
 * already knows: the REAL engine phase (`getPhaseForWeek` — never a
 * re-derivation), the session type, and the template. The register is
 * the codebase's standing one: describe what the plan is doing and why
 * in training terms; never claim physiology measurements, readiness, or
 * safety. Pure and total — returns null rather than guessing when the
 * plan context is missing (freeform runs, extras, legacy docs).
 */
import { getPhaseForWeek } from "@/features/program/runPlanTiming";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";

export interface SessionExplainerInput {
  /** Template type from RUN_TEMPLATES ("easy" | "tempo" | "intervals" |
   *  "long" | "race"). */
  type: string;
  /** Resolved template id (userOverride ?? templateId). */
  templateId: string;
  /** Stored 0-based week index; null when the plan carries no counters. */
  currentWeek: number | null | undefined;
  totalWeeks: number | null | undefined;
  distance: string | null | undefined;
  /** Whether the run's week holds a tempo or intervals session
   *  (`weekHoldsQuality`). The build's easy day and long run name the
   *  quality sessions only when it does: a returning runner's weeks hold none
   *  (Run15), nor does every other build week on the gentler setting. Left
   *  out, the week isn't assumed to. */
  weekHasQuality?: boolean;
}

/**
 * Whether the week `weekKey` starts holds a tempo or intervals session, the
 * person's swaps (`userOverride`) included.
 */
export function weekHoldsQuality(
  runDays:
    | ReadonlyArray<{
        templateId: string;
        userOverride?: string | null;
        weekKey?: string;
      }>
    | null
    | undefined,
  weekKey: string | null | undefined
): boolean {
  if (!runDays || !weekKey) return false;
  return runDays.some((day) => {
    if (day.weekKey !== weekKey) return false;
    const id = day.userOverride || day.templateId;
    const type = RUN_TEMPLATES.find((t) => t.id === id)?.type;
    return type === "tempo" || type === "intervals";
  });
}

/** Shared by Manage, Programme and Home: the explanation and real phase agree. */
export function runSessionPresentation(input: SessionExplainerInput): {
  purpose: string | null;
  weekLabel: string | null;
} {
  const purpose = runSessionExplainer(input);
  if (
    !purpose ||
    input.currentWeek == null ||
    input.totalWeeks == null ||
    !input.distance
  ) {
    return { purpose: null, weekLabel: null };
  }
  const phase = getPhaseForWeek(
    input.currentWeek,
    input.totalWeeks,
    input.distance as "5k" | "10k" | "half" | "marathon"
  );
  return {
    purpose,
    weekLabel: `${phase.charAt(0).toUpperCase() + phase.slice(1)} · week ${input.currentWeek + 1} of ${input.totalWeeks}`,
  };
}

const MEDIUM_LONG_IDS = new Set(["easy_60", "easy_75", "easy_90"]);

export function runSessionExplainer(
  input: SessionExplainerInput
): string | null {
  const {
    type,
    templateId,
    currentWeek,
    totalWeeks,
    distance,
    weekHasQuality,
  } = input;
  if (
    currentWeek == null ||
    totalWeeks == null ||
    !Number.isInteger(currentWeek) ||
    currentWeek < 0 ||
    !Number.isInteger(totalWeeks) ||
    totalWeeks <= 0 ||
    currentWeek >= totalWeeks ||
    (distance !== "5k" &&
      distance !== "10k" &&
      distance !== "half" &&
      distance !== "marathon")
  ) {
    return null;
  }
  const phase = getPhaseForWeek(currentWeek, totalWeeks, distance);
  const isStrides = templateId.endsWith("_strides");
  const isMediumLong = MEDIUM_LONG_IDS.has(templateId);

  if (phase === "race") {
    if (type === "race") {
      return "Race day. The whole block pointed here — trust the plan and start conservatively.";
    }
    return "Race-week shakeout — short and conversational; there's nothing left to gain from more.";
  }

  if (phase === "taper") {
    if (type === "intervals") {
      return "Taper sharpener — fast but small, keeping the legs quick while the volume drops.";
    }
    if (type === "long") {
      return "Taper long run — shorter on purpose, so the training you've banked shows up fresh.";
    }
    return "Taper — easy and short on purpose; recovery is the work now.";
  }

  // Base / build.
  if (type === "long") {
    if (phase === "base") {
      return "The week's anchor run — long-run volume ramps gradually through the base.";
    }
    return weekHasQuality
      ? "The week's anchor run — the long run keeps ramping while quality sharpens around it."
      : "The week's anchor run — it builds the endurance the race needs.";
  }
  if (type === "tempo") {
    return "Tempo — grows how long you can hold your threshold pace. The pace itself comes from your fitness, so the session ramps volume, not speed.";
  }
  if (type === "intervals") {
    return "Intervals — short fast repeats for top-end economy. The recovery between reps is part of the session, not a failure of it.";
  }
  // Easy family.
  if (isMediumLong) {
    return "The week's medium-long run — extra easy volume midweek, so the long run isn't carrying the whole week.";
  }
  if (isStrides) {
    return "Easy day with strides — relaxed 20-second accelerations keep leg speed awake at almost no cost. Not a hard session.";
  }
  if (phase === "base") {
    return "Base phase — easy aerobic volume is the foundation everything later stands on.";
  }
  return weekHasQuality
    ? "Easy day — it makes the quality sessions work. If it feels too easy, it's right."
    : "Easy day — most of your running is easy, and it all counts towards the race. If it feels too easy, it's right.";
}
