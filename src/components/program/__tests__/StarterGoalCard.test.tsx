// @vitest-environment jsdom
/**
 * Run9's starter goal on Train: the week in weeks of nine, never a date,
 * one plain line on a repeated week, and none of a race plan's phase,
 * compressed or easier-week words.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StarterGoalCard from "../StarterGoalCard";
import type { StarterProgress } from "@/features/program/starterProgress";
import { STARTER } from "@/test/journeyScreens";

const progress = (p: Partial<StarterProgress> = {}): StarterProgress => ({
  stage: 3,
  weekLabel: "Stage 3 of 9",
  toGoLabel: "7 stages to go",
  runsThisWeek: 0,
  runsForTheWeek: 2,
  repeated: false,
  reached: false,
  ...p,
});

describe("StarterGoalCard", () => {
  it("names the goal and the week, in weeks to go", () => {
    render(<StarterGoalCard progress={progress()} />);
    expect(screen.getByText("30 minutes without stopping")).toBeInTheDocument();
    expect(
      screen.getByText("Stage 3 of 9 · 7 stages to go")
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/compress|taper|base|build|easier|realign/i)
    ).not.toBeInTheDocument();
  });

  it("says once, plainly, that a week repeats", () => {
    render(<StarterGoalCard progress={progress({ repeated: true })} />);
    expect(
      screen.getByText("This stage again: 2 more runs on separate days to move on.")
    ).toBeInTheDocument();
  });

  it("says when the week is done, and when the goal is", () => {
    const { rerender } = render(
      <StarterGoalCard
        progress={progress({ runsThisWeek: 2, repeated: true })}
      />
    );
    // The name the journey waits on (src/test/journeyScreens.ts).
    expect(screen.getByText(STARTER.weekDone)).toBeInTheDocument();
    expect(screen.queryByText(/This week again/)).not.toBeInTheDocument();
    rerender(
      <StarterGoalCard
        progress={progress({
          stage: 9,
          weekLabel: "Stage 9 of 9",
          toGoLabel: "the last stage",
          runsThisWeek: 2,
          reached: true,
        })}
      />
    );
    expect(screen.getByText("You've done it.")).toBeInTheDocument();
  });
});
