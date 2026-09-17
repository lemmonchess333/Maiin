import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import WorkoutHistoryList from "../WorkoutHistoryList";
import type { Workout } from "@/hooks/useWorkouts";

describe("WorkoutHistoryList", () => {
  it("makes older records reachable in batches without losing their identity", () => {
    const workouts = Array.from(
      { length: 12 },
      (_, index) =>
        ({
          id: `saved-${index}`,
          date: "2026-08-01",
          notes: `Session ${index} — Programme Week 3`,
        }) as Workout
    );
    render(
      <MemoryRouter>
        <WorkoutHistoryList workouts={workouts} />
      </MemoryRouter>
    );
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Saved workouts" }));
    expect(screen.getByText("All dates · 12 sessions")).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: "Show more workouts" }));
    expect(screen.getAllByRole("link")).toHaveLength(12);
    /* Locate by href, not by accessible name. Each row renders its title
       and its date as two sibling spans, and jsdom's textContent joins
       them with nothing — so the name reads "Session 11 Aug 2026" for
       session 1 and "Session 111 Aug 2026" for session 11. A /Session 11/
       name therefore matches BOTH, and only avoided doing so while the
       date happened to begin with a letter ("Aug 1, 2026" under a US
       runner). The href is the identity this test is actually about. */
    const eleventh = screen
      .getAllByRole("link")
      .find((a) => a.getAttribute("href") === "/workout/saved-11");
    expect(eleventh).toBeTruthy();
    expect(eleventh?.textContent).toContain("Session 11");
    expect(
      screen.queryByRole("button", { name: "Show more workouts" })
    ).toBeNull();
  });
});
