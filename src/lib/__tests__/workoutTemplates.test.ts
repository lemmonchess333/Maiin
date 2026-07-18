import { describe, it, expect } from "vitest";
import {
  RUN_TEMPLATES,
  WORKOUT_TEMPLATES,
  getTemplatesByCategory,
  getTemplatesByDifficulty,
  getTemplateById,
  estimateTotalSets,
  estimateRestTime,
  isRaceTemplateId,
  isScheduledRaceRunDay,
} from "../workoutTemplates";

describe("RUN_TEMPLATES", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(RUN_TEMPLATES)).toBe(true);
    expect(RUN_TEMPLATES.length).toBeGreaterThan(0);
  });

  it("every template has required fields", () => {
    for (const t of RUN_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.type).toBeTruthy();
      expect(t.icon).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.estimatedDuration).toBeGreaterThan(0);
      expect(t.config).toBeDefined();
    }
  });

  it("all template ids are unique", () => {
    const ids = RUN_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all template types are valid", () => {
    const validTypes = ["easy", "tempo", "intervals", "long", "race"];
    for (const t of RUN_TEMPLATES) {
      expect(validTypes).toContain(t.type);
    }
  });

  it("interval templates have interval config", () => {
    const intervalTemplates = RUN_TEMPLATES.filter(
      (t) => t.type === "intervals"
    );
    expect(intervalTemplates.length).toBeGreaterThan(0);
    for (const t of intervalTemplates) {
      expect(t.config.intervals).toBeDefined();
      expect(t.config.intervals!.reps).toBeGreaterThan(0);
      expect(t.config.intervals!.restDuration).toBeGreaterThan(0);
    }
  });

  it("tempo templates have target pace", () => {
    const tempoTemplates = RUN_TEMPLATES.filter((t) => t.type === "tempo");
    for (const t of tempoTemplates) {
      expect(t.config.targetPace).toBeGreaterThan(0);
    }
  });

  it("long/race templates have target distance", () => {
    const distanceTemplates = RUN_TEMPLATES.filter(
      (t) => t.type === "long" || t.type === "race"
    );
    for (const t of distanceTemplates) {
      expect(t.config.targetDistance).toBeGreaterThan(0);
    }
  });

  it("contains expected template ids", () => {
    const ids = RUN_TEMPLATES.map((t) => t.id);
    expect(ids).toContain("easy_30");
    expect(ids).toContain("5x1k");
    expect(ids).toContain("long_10k");
    expect(ids).toContain("5k_race");
  });
});

describe("workoutTemplates", () => {
  it("has unique template IDs", () => {
    const ids = WORKOUT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all templates have required fields", () => {
    for (const template of WORKOUT_TEMPLATES) {
      expect(template.id).toBeTruthy();
      expect(template.name).toBeTruthy();
      expect(template.exercises.length).toBeGreaterThan(0);
      expect(template.estimatedMinutes).toBeGreaterThan(0);
    }
  });

  it("all exercises have valid sets and reps", () => {
    for (const template of WORKOUT_TEMPLATES) {
      for (const exercise of template.exercises) {
        expect(exercise.name).toBeTruthy();
        expect(exercise.sets).toBeGreaterThan(0);
        expect(exercise.reps).toBeTruthy();
        expect(exercise.restSeconds).toBeGreaterThan(0);
      }
    }
  });
});

describe("getTemplatesByCategory", () => {
  it("filters push templates", () => {
    const push = getTemplatesByCategory("push");
    expect(push.length).toBeGreaterThan(0);
    expect(push.every((t) => t.category === "push")).toBe(true);
  });

  it("returns empty for nonexistent category", () => {
    const result = getTemplatesByCategory("cardio");
    expect(result).toEqual([]);
  });
});

describe("getTemplatesByDifficulty", () => {
  it("filters beginner templates", () => {
    const beginner = getTemplatesByDifficulty("beginner");
    expect(beginner.length).toBeGreaterThan(0);
    expect(beginner.every((t) => t.difficulty === "beginner")).toBe(true);
  });
});

describe("getTemplateById", () => {
  it("finds existing template", () => {
    const template = getTemplateById("push-beginner");
    expect(template).toBeDefined();
    expect(template!.name).toBe("Push Day (Beginner)");
  });

  it("returns undefined for missing ID", () => {
    expect(getTemplateById("nonexistent")).toBeUndefined();
  });
});

describe("estimateTotalSets", () => {
  it("sums all sets", () => {
    const template = getTemplateById("push-beginner")!;
    const total = estimateTotalSets(template);
    expect(total).toBe(15); // 5 exercises × 3 sets
  });
});

describe("estimateRestTime", () => {
  it("calculates rest between sets", () => {
    const template = getTemplateById("push-beginner")!;
    const restTime = estimateRestTime(template);
    expect(restTime).toBeGreaterThan(0);
    // (3-1)*120 + (3-1)*90 + (3-1)*90 + (3-1)*60 + (3-1)*60 = 240+180+180+120+120 = 840
    expect(restTime).toBe(840);
  });
});

describe("isRaceTemplateId (RUN-RACE-GUARD-01)", () => {
  it("is true for every real race template id, false otherwise", () => {
    for (const id of ["5k_race", "10k_race", "half_race", "marathon_race"]) {
      expect(isRaceTemplateId(id)).toBe(true);
    }
    expect(isRaceTemplateId("easy_30")).toBe(false);
    expect(isRaceTemplateId("tempo_20")).toBe(false);
    // NEVER the literal "race" (real ids are `<dist>_race`).
    expect(isRaceTemplateId("race")).toBe(false);
    expect(isRaceTemplateId("")).toBe(false);
    expect(isRaceTemplateId(null)).toBe(false);
    expect(isRaceTemplateId(undefined)).toBe(false);
  });
});

describe("isScheduledRaceRunDay (RUN-RACE-GUARD-01)", () => {
  it("detects a race by the immutable `type`, even after a template override", () => {
    // Fresh race day.
    expect(
      isScheduledRaceRunDay({ type: "race", templateId: "marathon_race" })
    ).toBe(true);
    // Overridden to an easy template — templateId no longer a race, but
    // `type` is immutable, so the guard still fires. This is the exact
    // bypass RUN-RACE-GUARD-01 closes.
    expect(isScheduledRaceRunDay({ type: "race", templateId: "easy_30" })).toBe(
      true
    );
  });

  it("falls back to the base template id when `type` drifted", () => {
    expect(
      isScheduledRaceRunDay({ type: "tempo", templateId: "10k_race" })
    ).toBe(true);
  });

  it("is false for an ordinary run day", () => {
    expect(isScheduledRaceRunDay({ type: "easy", templateId: "easy_30" })).toBe(
      false
    );
    expect(isScheduledRaceRunDay({})).toBe(false);
  });
});
