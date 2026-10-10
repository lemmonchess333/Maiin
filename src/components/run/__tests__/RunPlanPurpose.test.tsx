import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RunPlanPurpose from "../RunPlanPurpose";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
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
  it("Run21 (3): says what the session is, how it should feel, why and what to do", () => {
    const tempo = RUN_TEMPLATES.find((t) => t.id === "tempo_20")!;
    const { rerender } = render(
      <RunPlanPurpose
        purpose="Build sustained effort."
        template={tempo}
        run={source}
        runDays={[source]}
      />
    );
    fireEvent.click(screen.getByText("Why this run"));
    const terms = screen.getAllByRole("term").map((el) => el.textContent);
    expect(terms).toEqual([
      "What it is",
      "How it should feel",
      "Why it's in your week",
      "If it feels wrong",
    ]);
    expect(screen.getByText(/^Comfortably hard: a few words/)).toBeVisible();
    expect(screen.getByText("Build sustained effort.")).toBeVisible();
    // No plan to give a reason: the other three lines still show.
    rerender(
      <RunPlanPurpose template={tempo} run={source} runDays={[source]} />
    );
    expect(screen.getAllByRole("term").map((el) => el.textContent)).toEqual([
      "What it is",
      "How it should feel",
      "If it feels wrong",
    ]);
  });

  it("does not render an empty disclosure", () => {
    render(<RunPlanPurpose run={undefined} runDays={[]} />);
    expect(screen.queryByText("Why this run")).toBeNull();
  });
});
