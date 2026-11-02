import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RaceGoalPlanner from "../RaceGoalPlanner";
import RaceFilters from "@/features/spaces/RaceFilters";
import { upcomingRaceSpaceDefs, spaceDef } from "@/features/spaces/spaceDefs";
import { getRaceGoalPlannerState } from "@/lib/raceGoalPlanner";

describe("race picker browsing", () => {
  const callbacks = () => ({
    onDistanceChange: vi.fn(),
    onTargetDateChange: vi.fn(),
    onEventNameChange: vi.fn(),
    onPickRace: vi.fn(),
    onEntryChange: vi.fn(),
  });
  const base = {
    distance: "marathon" as const,
    targetDate: "2027-04-19",
    eventName: "Boston Marathon",
    minDate: "2026-09-14",
    selectedEventSpaceId: "boston-marathon",
    entry: "race" as const,
    upcomingRaces: upcomingRaceSpaceDefs("2026-09-14"),
    state: getRaceGoalPlannerState({
      distance: "marathon",
      targetDate: "2027-04-19",
      currentDate: "2026-09-14",
      liftDays: 3,
      weeklyRunDays: 3,
    }),
  };
  it("offers both London race days and passes the selected day into the plan draft", () => {
    const handlers = callbacks();
    render(
      <RaceGoalPlanner
        {...base}
        {...handlers}
        selectedEventSpaceId="london-marathon"
        targetDate="2027-04-24"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "London Marathon" }));
    expect(
      screen.getByRole("option", { name: /London Marathon 24 Apr 2027/ })
    ).toHaveAttribute("aria-selected", "true");
    const sunday = screen.getByRole("option", {
      name: /London Marathon 25 Apr 2027/,
    });
    expect(sunday).toHaveAttribute("aria-selected", "false");
    fireEvent.click(sunday);
    expect(handlers.onPickRace).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "london-marathon",
        event: expect.objectContaining({ dateKey: "2027-04-25" }),
      })
    );
  });
  it("keeps ultras out of the plan picker even after clearing all filters", () => {
    // A 5K goal in a country with no 5K races leaves the list empty, and
    // its Clear filters opens every country and every distance.
    render(
      <RaceGoalPlanner
        {...base}
        {...callbacks()}
        distance="5k"
        selectedEventSpaceId=""
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Choose an upcoming race" })
    );
    fireEvent.change(screen.getByLabelText("Country"), {
      target: { value: "US" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(
      screen.queryByRole("option", { name: "Ultra" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Race to the|Chiltern 50/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /City of Lincoln 10K/ })
    ).toBeInTheDocument();
  });
  it("keeps the picker closed when the only upcoming event is an ultra", () => {
    render(
      <RaceGoalPlanner
        {...base}
        {...callbacks()}
        upcomingRaces={[spaceDef("chiltern-50")!]}
        selectedEventSpaceId=""
      />
    );
    expect(
      screen.queryByRole("button", { name: "Choose an upcoming race" })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Target date")).toBeInTheDocument();
  });
  it("does not offer the elapsed day of a two-day race", () => {
    render(
      <RaceGoalPlanner
        {...base}
        {...callbacks()}
        selectedEventSpaceId="london-marathon"
        minDate="2027-04-25"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "London Marathon" }));
    expect(
      screen.queryByRole("option", { name: /London Marathon 24 Apr 2027/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /London Marathon 25 Apr 2027/ })
    ).toBeInTheDocument();
  });
  /* The picker has no Distance filter of its own: the goal's Distance sits
     just below it and narrows the list, where a second Distance above it
     asked the same question twice. */
  it("narrows by the goal's distance, with no Distance filter of its own", () => {
    render(<RaceGoalPlanner {...base} {...callbacks()} />);
    fireEvent.click(screen.getByRole("button", { name: "Boston Marathon" }));
    expect(screen.queryByLabelText("Distance")).not.toBeInTheDocument();
    const races = within(
      screen.getByRole("listbox", { name: "Upcoming races" })
    ).getAllByRole("option");
    expect(races.length).toBeGreaterThan(0);
    for (const race of races)
      expect(race.getAttribute("aria-label")).toMatch(/Marathon$/);
  });

  it("starts in the selected race's country and preserves the goal through empty filters", async () => {
    const handlers = callbacks();
    // Two upcoming marathons, neither in the United Kingdom, so choosing
    // that country empties the list (the distance follows the goal).
    render(
      <RaceGoalPlanner
        {...base}
        {...handlers}
        upcomingRaces={[
          spaceDef("boston-marathon")!,
          spaceDef("paris-marathon")!,
        ]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Boston Marathon" }));
    expect(screen.getByLabelText("Country")).toHaveValue("US");
    fireEvent.change(screen.getByLabelText("Country"), {
      target: { value: "GB" },
    });
    expect(screen.getByText("No matching races")).toBeInTheDocument();
    expect(screen.getByLabelText("Target date")).toHaveValue("2027-04-19");
    expect(screen.getByLabelText("Race name (optional)")).toHaveValue(
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
    // The picker closes the way it opened (Collapse), then is gone.
    await waitFor(() =>
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    );
    expect(handlers.onDistanceChange).not.toHaveBeenCalled();
  });
  it("keeps manual entry available when the country and distance have no catalogue races", () => {
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
    expect(
      screen.getByRole("option", { name: /Edinburgh Marathon Festival 5K/ })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Country"), {
      target: { value: "US" },
    });
    expect(screen.getByText("No matching races")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Race name (optional)"), {
      target: { value: "My summer 5K" },
    });
    expect(handlers.onEventNameChange).toHaveBeenCalledWith("My summer 5K");
    expect(handlers.onPickRace).not.toHaveBeenCalled();
  });

  /* "Event name" with "London Marathon 2026" in the field read as a race
     already filled in. It is the race's name, and the field is empty
     until the person types one. */
  it("asks for the race's name with no example in the field", () => {
    render(
      <RaceGoalPlanner
        {...base}
        {...callbacks()}
        eventName=""
        selectedEventSpaceId=""
      />
    );
    const field = screen.getByLabelText("Race name (optional)");
    expect(field).not.toHaveAttribute("placeholder");
    expect(screen.queryByText(/Event name/)).not.toBeInTheDocument();
  });
});

describe("RaceFilters", () => {
  const value = { country: "GB", distance: "all" } as const;

  /* Side by side on a 320px phone, the Country select cut "United
     Kingdom" to "United King". Under 20em of row the two stack. */
  it("stacks its two selects on a narrow row", () => {
    render(<RaceFilters value={value} onChange={vi.fn()} />);
    const grid = screen.getByLabelText("Country").closest(".grid")!;
    expect(grid.className).toContain("grid-cols-2");
    expect(grid.className).toContain("@max-[20em]:grid-cols-1");
    expect(screen.getByLabelText("Distance")).toBeInTheDocument();
  });

  it("can leave the Distance filter out, Country then the row's width", () => {
    render(
      <RaceFilters value={value} onChange={vi.fn()} showDistance={false} />
    );
    expect(screen.queryByLabelText("Distance")).not.toBeInTheDocument();
    const grid = screen.getByLabelText("Country").closest(".grid")!;
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).not.toContain("grid-cols-2");
  });
});
