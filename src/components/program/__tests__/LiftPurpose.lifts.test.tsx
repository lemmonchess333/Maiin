/**
 * "Why this session" names each lift and why it is there (owner,
 * 2026-10-16: the sheet said why the session and nothing about "the
 * actual exercises").
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import LiftPurpose from "../LiftPurpose";
import type { LiftPurposeProgramme } from "@/lib/liftSessionPurpose";
import type { WorkoutDay } from "@/features/program/programTypes";

const programme: LiftPurposeProgramme = {
  weekNumber: 2,
  currentPhase: "accumulation" as LiftPurposeProgramme["currentPhase"],
  primaryGoal: "hypertrophy",
  workouts: [],
};

const day = {
  isCustom: false,
  exercises: [
    { exerciseId: "barbell-row", name: "Barbell Row", isAccessory: false },
    { exerciseId: "cable-curl", name: "Cable Curl", isAccessory: true },
  ],
} as unknown as Pick<WorkoutDay, "isCustom" | "exercises">;

describe("LiftPurpose — the lifts", () => {
  it("lists each lift with its role and reason, between the session and the rules", async () => {
    render(
      <LiftPurpose
        programme={programme}
        day={day}
        date="2026-10-17"
        experience="intermediate"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Why this session" }));
    const sheet = await screen.findByRole(
      "dialog",
      { name: "Why this session" },
      { timeout: 5000 }
    );
    const headings = within(sheet)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      "This session",
      "The lifts",
      "How your plan works",
    ]);
    expect(sheet).toHaveTextContent("Barbell Row · Main lift");
    expect(sheet).toHaveTextContent(
      "The lift this session is built around. Trains your lats"
    );
    expect(sheet).toHaveTextContent("Cable Curl · Isolation");
    expect(sheet).toHaveTextContent(
      "Trains your biceps directly, which the Barbell Row works only in part."
    );
  });
});
