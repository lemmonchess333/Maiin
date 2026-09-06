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
import { getPhaseForWeek } from "@/features/program/runScheduler";

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
  const { type, templateId, currentWeek, totalWeeks, distance } = input;
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
    return phase === "base"
      ? "The week's anchor run — long-run volume ramps gradually through the base."
      : "The week's anchor run — the long run keeps ramping while quality sharpens around it.";
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
  return phase === "base"
    ? "Base phase — easy aerobic volume is the foundation everything later stands on."
    : "Easy day — it makes the hard days work. If it feels too easy, it's right.";
}
