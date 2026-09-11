/**
 * Home's lift card and run card are twins, and that symmetry was the bug.
 *
 * ADR-0002: runs are date-pinned and lifts are split-ordered. Naming the
 * day IS a run's identity, so "Today · Run day" is correct. A lift's next
 * session is the Programme cursor's call, and Home resolves lifts by
 * weekday (`liftIndexForDayOfWeek`) — right for a calendar surface to
 * draw, wrong to assert as "the next session". The card deep-links to
 * `/program?day=N`, so tapping a weekday the rotation has not reached
 * landed on a Programme tab calling the same session "Upcoming", one tap
 * after Home called it "Today".
 *
 * The ADR's own constraint: a shared calendar surface must not assert a
 * weekday-pinned lift session identity as authoritative. Fixed as the ADR
 * says to fix it — language, not resolution. Neither surface changed which
 * workout it picks.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/homeAnalytics", () => ({ trackHomeEvent: vi.fn() }));

import LiftCTACard from "@/components/home/LiftCTACard";
import RunCTACard from "@/components/home/RunCTACard";

afterEach(cleanup);

const workout = {
  dayName: "Push A",
  exercises: [{ name: "Bench press" }, { name: "Overhead press" }],
  completed: false,
  skipped: false,
};

function renderLift(over: Record<string, unknown> = {}) {
  return render(
    <LiftCTACard
      nextWorkout={workout as never}
      navigate={vi.fn()}
      dayIndex={2}
      isStartable
      {...over}
    />
  );
}

describe("the lift card does not claim the cursor's session", () => {
  it("says what it knows — the lift planned for today", () => {
    renderLift();
    expect(screen.getByText("Planned for today")).toBeInTheDocument();
  });

  it("no longer asserts the session is today's", () => {
    // The exact string that contradicted the Programme tab's "Upcoming".
    renderLift();
    expect(screen.queryByText(/Today · Lift day/)).not.toBeInTheDocument();
  });

  it("does not call a later calendar session the first workout for a fresh account", () => {
    renderLift({ isFirst: true });
    expect(screen.getByText("Planned for today")).toBeInTheDocument();
    expect(screen.queryByText("Your first workout")).not.toBeInTheDocument();
  });

  it("still names the workout it resolved", () => {
    // Guards against "fixing" the contradiction by removing the session.
    renderLift();
    expect(screen.getByText("Push A")).toBeInTheDocument();
  });
});

describe("the run card keeps its date-pinned register", () => {
  it("still says Today · Run day", () => {
    // NOT collateral damage from the lift fix: a run's identity IS its
    // date, so this line is correct and the asymmetry is the point.
    render(
      <RunCTACard
        todayRun={{ templateId: "easy_30" } as never}
        navigate={vi.fn()}
      />
    );
    expect(screen.getByText("Today · Run day")).toBeInTheDocument();
  });
});
