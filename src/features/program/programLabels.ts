/**
 * Human-readable labels for the programme-shaping enums, as the onboarding
 * preview reads them back to the user ("Push / Pull / Legs", "Runs
 * 3x/week integrated"). Exhaustive switches: adding an enum member fails
 * the typecheck here until it has a label.
 *
 * programmeChanges.ts carries a second, deliberately different register
 * for the settings confirm modal, and ProgrammeSettings a third ("Stay
 * fit", "Running support" — lifting that supports running, a different
 * question with different words). Those are separate surfaces, not
 * duplicates to merge (CONTEXT.md naming rule).
 *
 * `goalLabel` is the exception, and for the reason that rule gives: what
 * hurts is inconsistency INSIDE one file. The goal labels here are read
 * back on onboarding's own review screen, over a choice the user made
 * from `GOALS` in the same file — so a goal picked as "Build muscle"
 * summarised itself as "Hypertrophy focus". `GOALS` now takes its copy
 * from here, which is why these read as the user's own words rather than
 * in the "… focus" register of their neighbours.
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
export type RunFrequency = "regular" | "occasional" | "none";

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
      return "Improve running";
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
  }
}
