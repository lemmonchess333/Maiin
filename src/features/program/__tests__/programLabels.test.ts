import { describe, it, expect } from "vitest";
import {
  equipmentLabel,
  experienceLabel,
  goalLabel,
  splitLabel,
} from "../programLabels";
import {
  VALID_EQUIPMENT,
  VALID_EXPERIENCE,
  type PreferredSplit,
  type PrimaryGoal,
} from "../programTypes";

const SPLITS: PreferredSplit[] = [
  "full_body",
  "upper_lower",
  "ppl",
  "bro_split",
  "auto",
];
const GOALS: PrimaryGoal[] = [
  "hypertrophy",
  "strength",
  "fat_loss",
  "general",
  "running",
];

function distinctNonEmpty(labels: string[]) {
  expect(labels.every((l) => l.trim().length > 0)).toBe(true);
  expect(new Set(labels).size).toBe(labels.length);
}

describe("programme labels (onboarding preview register)", () => {
  it("every split and goal has a distinct label", () => {
    distinctNonEmpty(SPLITS.map(splitLabel));
    distinctNonEmpty(GOALS.map(goalLabel));
  });

  it("every experience and equipment value the programme accepts has a label", () => {
    distinctNonEmpty(VALID_EXPERIENCE.map(experienceLabel));
    distinctNonEmpty(VALID_EQUIPMENT.map(equipmentLabel));
  });

  it("pins the copy the preview shows", () => {
    expect(splitLabel("ppl")).toBe("Push / Pull / Legs");
    expect(splitLabel("auto")).toBe("Auto-assigned");
    // The goal register is the user's own words, not the "… focus" one
    // its neighbours use: onboarding's review screen reads this back over
    // a choice the same file offered as "Lose fat".
    expect(goalLabel("fat_loss")).toBe("Lose fat");
    expect(goalLabel("hypertrophy")).toBe("Build muscle");
    expect(equipmentLabel("minimal")).toBe("Minimal");
  });
});
