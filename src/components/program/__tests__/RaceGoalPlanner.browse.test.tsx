import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RaceGoalPlanner from "../RaceGoalPlanner";
import { upcomingRaceSpaceDefs, spaceDef } from "@/features/spaces/spaceDefs";
import { getRaceGoalPlannerState } from "@/lib/raceGoalPlanner";

describe("race picker browsing", () => {
  const callbacks = () => ({
    onDistanceChange: vi.fn(),
    onTargetDateChange: vi.fn(),
    onEventNameChange: vi.fn(),
    onPickRace: vi.fn(),
  });
  const base = {
    distance: "marathon" as const,
    targetDate: "2027-04-19",
    eventName: "Boston Marathon",
    minDate: "2026-09-14",
    selectedEventSpaceId: "boston-marathon",
    upcomingRaces: upcomingRaceSpaceDefs("2026-09-14"),
    state: getRaceGoalPlannerState({
      distance: "marathon",
      targetDate: "2027-04-19",
      currentDate: "2026-09-14",
      liftDays: 3,
      weeklyRunDays: 3,
    }),
  };
  it("starts in the selected race's country and preserves the goal through empty filters", () => {
    const handlers = callbacks();
    render(<RaceGoalPlanner {...base} {...handlers} />);
    fireEvent.click(screen.getByRole("button", { name: "Boston Marathon" }));
    expect(screen.getByLabelText("Country")).toHaveValue("US");
    expect(screen.getByLabelText("Distance")).toHaveValue("marathon");
    fireEvent.change(screen.getByLabelText("Distance"), {
      target: { value: "half" },
    });
    expect(screen.getByText("No matching races")).toBeInTheDocument();
    expect(screen.getByLabelText("Target date")).toHaveValue("2027-04-19");
    expect(screen.getByLabelText("Event name (optional)")).toHaveValue(
      "Boston Marathon"
    );
    for (const handler of Object.values(handlers))
      expect(handler).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(
      screen.getByRole("option", { name: /Boston Marathon/ })
    ).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("option", { name: /Paris Marathon/ }));
    expect(handlers.onPickRace).toHaveBeenCalledWith(
      spaceDef("paris-marathon")
    );
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(handlers.onDistanceChange).not.toHaveBeenCalled();
  });
  it("keeps manual entry available when the chosen distance has no catalogue races", () => {
    const handlers = callbacks();
    render(
      <RaceGoalPlanner
        {...base}
        {...handlers}
        distance="5k"
        selectedEventSpaceId=""
        eventName="My local 5K"
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Choose an upcoming race" })
    );
    expect(screen.getByLabelText("Country")).toHaveValue("GB");
    expect(screen.getByText("No matching races")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Event name (optional)"), {
      target: { value: "My summer 5K" },
    });
    expect(handlers.onEventNameChange).toHaveBeenCalledWith("My summer 5K");
    expect(handlers.onPickRace).not.toHaveBeenCalled();
  });
});
