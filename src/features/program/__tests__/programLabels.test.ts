/**
 * Coverage for three previously-untested pure helpers in the program module:
 *   - splitLabel / primaryGoalLabel (programEngine) — the display maps the
 *     Programme UI renders; an unmapped enum value would surface a blank/wrong
 *     label.
 *   - buildContraIndex (matchTemplate) — aggregates every exercise's
 *     contraindicated list across a template library into one lookup map; the
 *     injury-filter path depends on it being complete + deduped.
 */
import { describe, it, expect } from "vitest";
import { splitLabel, primaryGoalLabel } from "../programEngine";
import { buildContraIndex } from "../matchTemplate";
import type { ProgramTemplate } from "../templates";

describe("splitLabel", () => {
  it("maps every SplitType to its display label", () => {
    expect(splitLabel("full_body")).toBe("Full Body");
    expect(splitLabel("upper_lower")).toBe("Upper / Lower");
    expect(splitLabel("ppl")).toBe("Push / Pull / Legs");
    expect(splitLabel("ppl_ul")).toBe("Push / Pull / Legs + Upper / Lower");
    expect(splitLabel("ppl_x2")).toBe("Push / Pull / Legs ×2");
    expect(splitLabel("ppl_x2_fb")).toBe("Push / Pull / Legs ×2 + Full Body");
  });
});

describe("primaryGoalLabel", () => {
  it("maps every PrimaryGoal to its display label", () => {
    expect(primaryGoalLabel("strength")).toBe("Strength");
    expect(primaryGoalLabel("hypertrophy")).toBe("Hypertrophy");
    expect(primaryGoalLabel("fat_loss")).toBe("Fat Loss");
    expect(primaryGoalLabel("general")).toBe("General Fitness");
    expect(primaryGoalLabel("running")).toBe("Running Support");
  });

  it("falls back to General Fitness for an undefined / unknown goal", () => {
    expect(primaryGoalLabel(undefined)).toBe("General Fitness");
  });
});

describe("buildContraIndex", () => {
  // Minimal template builder: one week, one day, the given exercises.
  const tmpl = (
    id: string,
    exercises: { exerciseId: string; contraindicated?: string[] }[]
  ): ProgramTemplate =>
    ({
      id,
      name: id,
      split: "full_body",
      daysPerWeek: 1,
      goal: "general",
      experience: ["intermediate"],
      equipment: "full_gym",
      gender: ["male", "female", "unspecified"],
      runIntegration: false,
      weeks: [{ days: [{ exercises }] }],
    }) as unknown as ProgramTemplate;

  it("returns an empty map when nothing is contraindicated", () => {
    const idx = buildContraIndex([tmpl("a", [{ exerciseId: "squat" }])]);
    expect(idx.size).toBe(0);
  });

  it("indexes an exercise's contraindications by exerciseId", () => {
    const idx = buildContraIndex([
      tmpl("a", [{ exerciseId: "squat", contraindicated: ["knee", "hip"] }]),
    ]);
    expect([...idx.get("squat")!].sort()).toEqual(["hip", "knee"]);
  });

  it("merges + dedupes contraindications for the same exercise across templates", () => {
    const idx = buildContraIndex([
      tmpl("a", [{ exerciseId: "squat", contraindicated: ["knee"] }]),
      tmpl("b", [{ exerciseId: "squat", contraindicated: ["knee", "back"] }]),
    ]);
    expect([...idx.get("squat")!].sort()).toEqual(["back", "knee"]);
  });

  it("ignores empty contraindicated arrays (no zombie entries)", () => {
    const idx = buildContraIndex([
      tmpl("a", [{ exerciseId: "bench", contraindicated: [] }]),
    ]);
    expect(idx.has("bench")).toBe(false);
  });
});
