import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RunPlanPurpose from "../RunPlanPurpose";
import type { ScheduledRunDay } from "@/features/program/programTypes";

describe("current run planning explanation", () => {
  const source: ScheduledRunDay = {
    id: "a",
    dayIndex: 6,
    date: "2026-09-12",
    templateId: "tempo_20",
    type: "tempo",
    status: "planned",
  };
  const neighbour: ScheduledRunDay = {
    id: "b",
    dayIndex: 0,
    date: "2026-09-13",
    templateId: "long_10k",
    type: "long",
    status: "planned",
  };
  it("refreshes its explanation after a move or easier-session choice", () => {
    const { rerender } = render(
      <RunPlanPurpose
        purpose="Build sustained effort."
        run={source}
        runDays={[source, neighbour]}
      />
    );
    fireEvent.click(screen.getByText("Why this run"));
    expect(
      screen.getByText(/Another demanding run is planned for Sunday/)
    ).toBeVisible();
    rerender(
      <RunPlanPurpose
        purpose="Build sustained effort."
        run={{ ...source, date: "2026-09-10", dayIndex: 4 }}
        runDays={[neighbour]}
      />
    );
    expect(screen.queryByText(/Another demanding run/)).toBeNull();
    rerender(
      <RunPlanPurpose
        purpose="Easy running."
        run={{ ...source, userOverride: "easy_30" }}
        runDays={[neighbour]}
      />
    );
    expect(screen.queryByText(/Another demanding run/)).toBeNull();
  });
  it("does not render an empty disclosure", () => {
    render(<RunPlanPurpose run={undefined} runDays={[]} />);
    expect(screen.queryByText("Why this run")).toBeNull();
  });
});
