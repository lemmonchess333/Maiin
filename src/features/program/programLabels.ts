/**
 * Human-readable labels for the programme-shaping enums, as the onboarding
 * preview reads them back to the user ("Push / Pull / Legs", "Runs
 * 3x/week integrated"). Exhaustive switches: adding an enum member fails
 * the typecheck here until it has a label.
 *
 * programmeChanges.ts carries a second, deliberately different register
 * for the settings confirm modal.
 *
 * `goalLabel` is the exception: the goals have one set of names everywhere
 * (Lift4 (4)), the same as Train's and Settings' (`FOCUS_LABELS` in
 * trainingBlock.ts). They are read back on onboarding's own review screen,
 * over a choice the user made from `GOALS` in the same file — so a goal
 * picked as "Build muscle" summarised itself as "Hypertrophy focus".
 * `GOALS` takes its copy from here, which is why these read as the user's
 * own words rather than in the "… focus" register of their neighbours.
 */
import type {
  Equipment,
  Experience,
  PreferredSplit,
  PrimaryGoal,
} from "./programTypes";

/** How often the user wants runs woven into the lifting week. Onboarding-only
 *  vocabulary (the programme itself stores runDays), so it lives beside its
 *  labels rather than in programTypes. */
export type RunFrequency = "regular" | "occasional" | "none" | "new";

export function splitLabel(s: PreferredSplit): string {
  switch (s) {
    case "full_body":
      return "Full Body";
    case "upper_lower":
      return "Upper / Lower";
    case "ppl":
      return "Push / Pull / Legs";
    case "bro_split":
      return "Bro Split";
    case "auto":
      return "Auto-assigned";
  }
}

export function goalLabel(g: PrimaryGoal): string {
  switch (g) {
    case "hypertrophy":
      return "Build muscle";
    case "strength":
      return "Get stronger";
    case "fat_loss":
      return "Lose fat";
    case "general":
      return "General fitness";
    case "running":
      return "Support my running";
  }
}

export function experienceLabel(e: Experience): string {
  switch (e) {
    case "beginner":
      return "Beginner";
    case "intermediate":
      return "Intermediate";
    case "advanced":
      return "Advanced";
  }
}

export function equipmentLabel(e: Equipment): string {
  switch (e) {
    case "full_gym":
      return "Full gym";
    case "home_gym":
      return "Home gym";
    case "minimal":
      return "Minimal";
    case "no_equipment":
      return "No equipment";
  }
}

/** Whether a setup takes the "A barbell and a rack" answer beside its kit
 *  (Lift4 (11)): a home gym or a minimal one. A full gym has a barbell, and
 *  with no equipment there is none. */
export function takesBarbellAtHome(equipment: string | undefined): boolean {
  return equipment === "home_gym" || equipment === "minimal";
}

/** Whether a setup takes "Small plates": every one with weights to load. */
export function takesSmallPlates(equipment: string | undefined): boolean {
  return equipment !== "no_equipment";
}

/** Whether a setup takes the "A pull-up bar" answer: a home gym or a
 *  minimal one. A full gym has one, and with no equipment there is none. */
export function takesPullUpBar(equipment: string | undefined): boolean {
  return equipment === "home_gym" || equipment === "minimal";
}

/** The pull-up bar answer a setup starts from when the person chooses it:
 *  on for a home gym, whose setup has always had one, off for Minimal. */
export function pullUpBarWhenChosen(equipment: string | undefined): boolean {
  return equipment === "home_gym";
}

/**
 * Whether a plan may use a pull-up bar. For a home gym or a minimal setup
 * it is the person's answer, and yes where they haven't given one: a home
 * gym has always had a bar, and a Minimal plan the person has keeps its
 * pull-ups until they say no (Pgm5). Every new answer is written, so a
 * missing one is an older plan's.
 */
export function hasPullUpBar(
  equipment: string | undefined,
  answer: boolean | undefined
): boolean {
  if (!takesPullUpBar(equipment)) return equipment !== "no_equipment";
  return answer ?? true;
}
