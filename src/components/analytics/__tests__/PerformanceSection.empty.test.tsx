/**
 * Analytics' Performance section, with no performance doc.
 *
 * The section's empty branch fires on `!currentWeek`, which means "the
 * server has not written a performance doc" — not "nothing is logged". The
 * doc comes from `onWorkoutCreated` / `onRunCreated`, so a user who has just
 * saved their first session sits in this branch for as long as the trigger
 * takes. It used to greet them with "No sessions logged yet" on a page whose
 * next row listed the session they had just finished.
 *
 * Rendered rather than asserted through the copy resolver, because the
 * defect was in the wiring — the resolver could be right and the section
 * still print the old literal.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockUsePerformanceWeeks = vi.fn();
vi.mock("@/hooks/usePerformance", () => ({
  usePerformanceWeeks: (...args: unknown[]) => mockUsePerformanceWeeks(...args),
}));

import PerformanceSection from "../PerformanceSection";

function renderSection(props: { hasLoggedSession?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <PerformanceSection {...props} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  cleanup();
  mockUsePerformanceWeeks.mockReturnValue({
    weeks: [],
    currentWeek: null,
    previousWeek: null,
    loading: false,
  });
});

describe("PerformanceSection — no performance doc", () => {
  it("nothing logged: says so, and points at the workout flow", () => {
    renderSection();
    expect(screen.getByText("No sessions logged yet")).toBeInTheDocument();
    expect(screen.getByText(/start a workout/i)).toBeInTheDocument();
  });

  it("a session is logged: does not claim otherwise", () => {
    renderSection({ hasLoggedSession: true });
    expect(screen.queryByText("No sessions logged yet")).toBeNull();
    expect(
      screen.getByText("Performance is still catching up")
    ).toBeInTheDocument();
  });

  it("a session is logged: no next step to offer", () => {
    const { container } = renderSection({ hasLoggedSession: true });
    expect(screen.queryByText(/start a workout/i)).toBeNull();
    expect(container.querySelector('a[href="/program"]')).toBeNull();
  });

  it("the two surfaces share one source of copy", () => {
    /* Analytics carried its own literal ("Your Performance Index appears
       after your first logged session.") beside Home's EMPTY_STATE_LINE —
       the same slot, two sentences, free to drift. */
    renderSection();
    const analytics = screen.getByText(
      /Your Performance will appear after your first logged session/i
    );
    expect(analytics).toBeInTheDocument();
  });
});

describe("the signal reaches both surfaces", () => {
  /* Both components default `hasLoggedSession` to false, so an unwired call
     site silently restores the old behaviour and every test above still
     passes. This reads the two pages instead.

     What it proves is narrow — that the prop is passed, not that the
     expression behind it is the right one. Rendering either page for real
     needs most of its data layer mocked, which would pin the mocks rather
     than the pages. This catches the regression that actually happens: the
     prop being dropped. */
  const read = (rel: string) =>
    readFileSync(resolve(__dirname, "../../..", rel), "utf8");

  it("Home passes it to the hero card", () => {
    const src = read("pages/Home.tsx");
    expect(src).toMatch(/<PerformanceHeroCard[\s\S]*?hasLoggedSession=/);
  });

  it("Analytics passes it to the section", () => {
    const src = read("pages/History.tsx");
    expect(src).toMatch(/<PerformanceSection[\s\S]*?hasLoggedSession=/);
  });
});
