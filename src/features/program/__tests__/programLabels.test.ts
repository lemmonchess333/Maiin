import { describe, it, expect } from "vitest";
import {
  equipmentLabel,
  experienceLabel,
  goalLabel,
  runFreqLabel,
  splitLabel,
  type RunFrequency,
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
const RUN_FREQS: RunFrequency[] = ["regular", "occasional", "none"];

function distinctNonEmpty(labels: string[]) {
  expect(labels.every((l) => l.trim().length > 0)).toBe(true);
  expect(new Set(labels).size).toBe(labels.length);
}

describe("programme labels (onboarding preview register)", () => {
  it("every split, goal and run frequency has a distinct label", () => {
    distinctNonEmpty(SPLITS.map(splitLabel));
    distinctNonEmpty(GOALS.map(goalLabel));
    distinctNonEmpty(RUN_FREQS.map(runFreqLabel));
  });

  it("every experience and equipment value the programme accepts has a label", () => {
    distinctNonEmpty(VALID_EXPERIENCE.map(experienceLabel));
    distinctNonEmpty(VALID_EQUIPMENT.map(equipmentLabel));
  });

  it("pins the copy the preview shows", () => {
    expect(splitLabel("ppl")).toBe("Push / Pull / Legs");
    expect(splitLabel("auto")).toBe("Auto-assigned");
    expect(goalLabel("fat_loss")).toBe("Fat loss focus");
    expect(runFreqLabel("regular")).toBe("Runs 3x/week integrated");
    expect(equipmentLabel("minimal")).toBe("Minimal");
  });
});
