/**
 * Train's ⓘ beside the week label (Lift4 (3)): how the plan works, on any
 * day, for this person's plan.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import WeekPhaseRow from "../WeekPhaseRow";
import LiftRulesInfo from "../LiftRulesInfo";
import type { LiftPurposeProgramme } from "@/lib/liftSessionPurpose";

function renderRow(programme: LiftPurposeProgramme, purpose: string | null) {
  render(
    <WeekPhaseRow
      weekNumber={7}
      label="Week 7 of 16 · Build"
      onPrevWeek={() => {}}
      onNextWeek={() => {}}
      canGoPrev={false}
      canGoNext={false}
      info={
        <LiftRulesInfo
          purpose={purpose}
          programme={programme}
          experience="intermediate"
        />
      }
    />
  );
}

describe("LiftRulesInfo", () => {
  it("opens how the plan works, for the person's own plan", async () => {
    renderRow(
      {
        workouts: [{}, {}, {}] as LiftPurposeProgramme["workouts"],
        runPlan: { mode: "race_prep" },
        settings: { autoProgression: true, smallPlates: true },
      },
      null
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "How your plan works" })
    );
    const sheet = await screen.findByRole(
      "dialog",
      { name: "How your plan works" },
      { timeout: 5000 }
    );
    // No session to explain here: the rules alone.
    expect(within(sheet).queryByText("This session")).toBeNull();
    expect(sheet).toHaveTextContent("1.25 kg on a barbell");
    expect(sheet).toHaveTextContent(
      "Your lighter weeks fall on your run plan's easier weeks"
    );
    expect(sheet).toHaveTextContent("Your race");
  });

  it("puts a session's reasons first when it has some", async () => {
    renderRow({ workouts: [] }, "This session is built for strength.");
    fireEvent.click(
      screen.getByRole("button", { name: "How your plan works" })
    );
    const sheet = await screen.findByRole(
      "dialog",
      { name: "Why this session" },
      { timeout: 5000 }
    );
    expect(within(sheet).getByText("This session")).toBeInTheDocument();
    expect(sheet).toHaveTextContent("This session is built for strength.");
    expect(within(sheet).getByText("How your plan works")).toBeInTheDocument();
  });
});
