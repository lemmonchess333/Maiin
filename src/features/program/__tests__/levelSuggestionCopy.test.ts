/**
 * The level suggestion's copy says what a level change does to the main
 * lifts (Lift4 (12)), for the person's goal: a range of reps where the role
 * table gives an intermediate's main lifts one, heavier and lighter days at
 * every goal.
 */
import { describe, expect, it } from "vitest";
import { levelSuggestionCopy } from "../levelSuggestionCopy";

describe("levelSuggestionCopy", () => {
  it("names the range for a goal whose main lifts climb one", () => {
    for (const goal of ["hypertrophy", "general", "fat_loss"] as const) {
      expect(levelSuggestionCopy({ to: "intermediate" }, goal).body).toContain(
        "Intermediate gives your main lifts a range of reps, and heavier and lighter days,"
      );
      expect(levelSuggestionCopy({ to: "beginner" }, goal).body).toContain(
        "Beginner gives your main lifts one target each, without heavier and lighter days,"
      );
    }
  });

  it("names only the heavier and lighter days where main lifts keep one target", () => {
    for (const goal of ["strength", "running"] as const) {
      const up = levelSuggestionCopy({ to: "intermediate" }, goal).body;
      expect(up).toContain(
        "Intermediate gives your main lifts heavier and lighter days,"
      );
      expect(up).not.toMatch(/range/);
      expect(levelSuggestionCopy({ to: "beginner" }, goal).body).toContain(
        "Beginner takes the heavier and lighter days off your main lifts,"
      );
    }
  });

  it("keeps the exercises and promises no other cadence", () => {
    for (const to of ["intermediate", "beginner"] as const) {
      const { body } = levelSuggestionCopy({ to }, "hypertrophy");
      expect(body).toContain("Your exercises stay as they are.");
      expect(body).not.toMatch(/week to week/i);
    }
  });
});
