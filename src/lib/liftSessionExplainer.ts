import type {
  ProgramState,
  ProgressionType,
} from "@/features/program/programTypes";
import type { SessionVariant } from "@/features/program/expressSession";
import {
  generateWeekPrescription,
  primaryGoalLabel,
} from "@/features/program/programEngine";
import { blockWeekOf, focusLabel } from "@/features/program/trainingBlock";
import { isProgressionHeld } from "@/features/program/represcribe";

type ProgrammeContext = Partial<
  Pick<
    ProgramState,
    "weekNumber" | "currentPhase" | "primaryGoal" | "trainingBlock"
  >
>;

function cycleWeek(week: number | undefined): number | null {
  return week !== undefined && Number.isInteger(week) && week > 0
    ? ((week - 1) % 4) + 1
    : null;
}

/** One display vocabulary; block dates never replace the engine's week counter. */
export function liftWeekLabel(
  state: ProgrammeContext | null | undefined,
  today: string
): string | null {
  if (!state) return null;
  const block = state.trainingBlock;
  const week = block ? blockWeekOf(block, today) : null;
  if (block && week !== null) {
    return `Week ${week} of ${block.durationWeeks} · ${focusLabel(block.focus)}`;
  }
  if (cycleWeek(state.weekNumber) === null) return null;
  return `Week ${cycleWeek(state.weekNumber)} of 4 · ${state.currentPhase === "deload" ? "Deload" : primaryGoalLabel(state.primaryGoal)}`;
}

/** Describe persisted programme facts only. Routine/ad-hoc callers pass no state. */
export function liftSessionExplainer(
  state: ProgrammeContext | null | undefined,
  today: string,
  variant: SessionVariant = "full",
  progressionRules: readonly ProgressionType[] = []
): string | null {
  if (!state || cycleWeek(state.weekNumber) === null) return null;
  if (variant === "easier_today")
    return "Easier today — fewer sets and lighter loads, by design.";
  if (variant !== "full")
    return "Shorter today — the main lifts stay; accessories and sets may be trimmed.";
  if (state.currentPhase === "deload")
    return "Step-back week — reduced work and lighter loads, by design.";

  const block = state.trainingBlock;
  const week = block ? blockWeekOf(block, today) : null;
  if (block?.owned && week !== null) {
    const label = `Week ${week} of ${block.durationWeeks} · ${focusLabel(block.focus)}`;
    if (isProgressionHeld(block, week))
      return `${label} — loads hold while you ease back in.`;
    if (block.pace !== "full")
      return `${label} — a shorter session is offered where available.`;
    return `${label} — today's lifts follow this focus.`;
  }
  const label = `Week ${cycleWeek(state.weekNumber)} of 4`;
  if (generateWeekPrescription(state.weekNumber! + 1).deload)
    return `${label} — last build week before the deload.`;
  if (
    progressionRules.length > 0 &&
    progressionRules.every((rule) => rule === "double")
  ) {
    return `${label} — reps build towards the target before load increases.`;
  }
  return `${label} — progression follows your logged sets.`;
}
