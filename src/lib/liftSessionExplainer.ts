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

/**
 * Describe persisted programme facts only. Routine/ad-hoc callers pass no
 * state.
 *
 * Every line is capped at MAX_EXPLAINER_CHARS so it renders on ONE line in
 * the session card, between the day name and the meta line. The first cut
 * of these allowed 90 characters and read as a paragraph: the sentence
 * wrapped, split the title from the meta, and pushed the Start button down
 * the card. `liftSessionExplainerLength.test.ts` walks every reachable
 * branch and fails on a long one.
 *
 * They use the middot the rest of the app uses for "fact · fact" rather
 * than an em dash. Six new "statement — explanation" strings landed on the
 * two most-visited screens at once, and the repetition of one sentence
 * shape is what made the copy read as machine-written; the character was
 * never the problem on its own.
 *
 * The block branch keeps the focus label because there the focus IS the
 * reason for today's session, and its pace becomes a third short segment
 * rather than a clause. The plain-cycle branch has no focus to name.
 */
export const MAX_EXPLAINER_CHARS = 45;

export function liftSessionExplainer(
  state: ProgrammeContext | null | undefined,
  today: string,
  variant: SessionVariant = "full",
  progressionRules: readonly ProgressionType[] = []
): string | null {
  if (!state || cycleWeek(state.weekNumber) === null) return null;
  if (variant === "easier_today")
    return "Easier today · fewer sets, lighter loads";
  if (variant !== "full") return "Shorter today · main lifts stay";
  if (state.currentPhase === "deload")
    return "Step-back week · lighter by design";

  const block = state.trainingBlock;
  const week = block ? blockWeekOf(block, today) : null;
  if (block?.owned && week !== null) {
    const label = `Week ${week} of ${block.durationWeeks} · ${focusLabel(block.focus)}`;
    if (isProgressionHeld(block, week)) return `${label} · easing in`;
    if (block.pace !== "full") return `${label} · shorter`;
    return label;
  }
  const label = `Week ${cycleWeek(state.weekNumber)} of 4`;
  if (generateWeekPrescription(state.weekNumber! + 1).deload)
    return `${label} · last build week`;
  if (
    progressionRules.length > 0 &&
    progressionRules.every((rule) => rule === "double")
  ) {
    return `${label} · reps first, then load`;
  }
  return `${label} · progression follows your sets`;
}
