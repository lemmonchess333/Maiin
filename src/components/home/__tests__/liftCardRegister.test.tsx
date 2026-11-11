/**
 * Home's lift card and run card are twins, and that symmetry was the bug.
 *
 * ADR-0002: runs are date-pinned and lifts are split-ordered. Naming the
 * day IS a run's identity, so "Today · Run day" was correct. A lift's next
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
 *
 * DS4 (Home's hero) moved the day into the kicker beside the date, where
 * it is the page's, not the session's: neither hero carries an eyebrow, so
 * the lift hero names its session and claims nothing about the day, and
 * the run hero's date-pinned identity is the date it opens in Train.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/homeAnalytics", () => ({ track: vi.fn() }));

import LiftCTACard from "@/components/home/LiftCTACard";
import RunCTACard from "@/components/home/RunCTACard";
import { liftTargets, runStartTarget } from "@/lib/todaySession";

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
      {...liftTargets(2)}
      isStartable
      {...over}
    />
  );
}

describe("the lift card's line against last time", () => {
  /* After a save the day holds next time's load and this session as
     "last time" (applySessionProgression). */
  const progressed = {
    ...workout,
    exercises: [
      {
        name: "Barbell row",
        sets: 3,
        reps: 8,
        weight: 37.5,
        lastPerformance: { weight: 35, reps: 8 },
      },
    ],
  };

  it("is drawn for a day still to train", () => {
    renderLift({ nextWorkout: progressed, unit: "kg" });
    expect(screen.getByText(/more than last time/)).toBeInTheDocument();
  });

  it("is not drawn once the day is done or skipped", () => {
    for (const status of ["completed", "skipped"]) {
      const view = renderLift({
        nextWorkout: { ...progressed, completed: status === "completed" },
        status,
        unit: "kg",
      });
      expect(screen.queryByText(/than last time/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Barbell row 37/)).not.toBeInTheDocument();
      view.unmount();
    }
  });
});

describe("the lift card does not claim the cursor's session", () => {
  it("names the workout it resolved, and claims nothing about the day", () => {
    renderLift();
    expect(screen.getByRole("heading", { name: "Push A" })).toBeInTheDocument();
    expect(screen.queryByText(/today/i)).not.toBeInTheDocument();
  });

  it("no longer asserts the session is today's", () => {
    // The exact string that contradicted the Programme tab's "Upcoming".
    renderLift();
    expect(screen.queryByText(/Today · Lift day/)).not.toBeInTheDocument();
  });

  it("does not call a later calendar session the first workout for a fresh account", () => {
    // `heroKicker` names a first workout only for a rest day's offer
    // (homeHero.test.ts); the card itself never does.
    renderLift({ isFirst: true });
    expect(screen.queryByText("Your first workout")).not.toBeInTheDocument();
  });
});

describe("the run card keeps its date-pinned register", () => {
  /* The run hero opens today's date in Train, so the date is pinned. Only
     Date is faked; no timers move. */
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 27, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens the run by its date, as a run's identity is", () => {
    // NOT collateral damage from the lift fix: a run's identity IS its
    // date, so the run hero opens its day, and the asymmetry is the point.
    const navigate = vi.fn();
    render(
      <RunCTACard
        unit="km"
        todayRun={{ templateId: "easy_30" } as never}
        startTarget={runStartTarget({ templateId: "easy_30" } as never)}
        navigate={navigate}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Open Easy 30 in Train" })
    );
    expect(navigate).toHaveBeenCalledExactlyOnceWith(
      "/program?tab=run&rday=2026-09-27"
    );
  });
});

describe("the lift card's muscle line", () => {
  it("says the muscles as words that wrap, and keeps the minutes whole", () => {
    renderLift({
      muscleGroups: "Back · Shoulders · Legs + more",
      nextWorkout: {
        ...workout,
        exercises: workout.exercises.map((ex) => ({
          ...ex,
          sets: 3,
          restSeconds: 90,
        })),
      },
    });
    const line = screen.getByText(
      (_, el) =>
        el?.tagName === "P" &&
        /^Back, shoulders, legs and more · about \d+ min$/.test(
          el.textContent ?? ""
        )
    );
    // The words have no nowrap box of their own, so a narrow hero breaks
    // between them at large text rather than running past the screen; the
    // minutes are one fact and stay together.
    const words = screen.getByText("Back, shoulders, legs and more");
    expect(line).toContainElement(words);
    expect(words.closest(".whitespace-nowrap")).toBeNull();
    const minutes = screen.getByText((_, el) =>
      /^about \d+ min$/.test(el?.textContent ?? "")
    );
    expect(minutes).toHaveClass("whitespace-nowrap");
  });
});
