/**
 * Human-readable labels for the programme-shaping enums, as the onboarding
 * preview reads them back to the user ("Push / Pull / Legs", "Fat loss
 * focus", "Runs 3x/week integrated"). Exhaustive switches: adding an enum
 * member fails the typecheck here until it has a label.
 *
 * programmeChanges.ts carries a second, deliberately different register
 * for the settings confirm modal ("Build muscle", "No preference") — the
 * two are separate surfaces, not a duplicate to merge (CONTEXT.md naming
 * rule).
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
      return "Hypertrophy focus";
    case "strength":
      return "Strength focus";
    case "fat_loss":
      return "Fat loss focus";
    case "general":
      return "General fitness";
    case "running":
      return "Running focus";
  }
}

export function runFreqLabel(r: RunFrequency): string {
  switch (r) {
    case "regular":
      return "Runs 3x/week integrated";
    case "occasional":
      return "Runs 1-2x/week integrated";
    case "none":
      return "No running";
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
