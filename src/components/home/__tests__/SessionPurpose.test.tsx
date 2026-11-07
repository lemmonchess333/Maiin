import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import LiftCTACard from "../LiftCTACard";
import RunCTACard from "../RunCTACard";
import SessionCommandCard from "@/components/program/SessionCommandCard";
import {
  runSessionPresentation,
  runSessionExplainer,
} from "@/lib/runSessionExplainer";
import type { ScheduledRunDay } from "@/features/program/runScheduler";
import {
  liftTargets,
  runStartTarget,
  type TodaySession,
} from "@/lib/todaySession";
import { heroKicker, planPosition } from "@/lib/homeHero";
import type { ProgramState } from "@/features/program/programTypes";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/homeAnalytics", () => ({ track: vi.fn() }));

/** A run day as `todaySession` decides one, for the hero's kicker. */
const runHeroDay: TodaySession = {
  type: "run",
  restContext: {},
  lift: null,
  run: {
    runDay: null,
    startTarget: runStartTarget(null),
    completed: false,
    isFirst: false,
    dose: null,
  },
  rest: null,
};

describe("session purpose command surfaces", () => {
  it("keeps lift rationale off Home while preserving the muscle meta", () => {
    const purpose = "Week 3 of 4 · progression follows your sets";
    const { container } = render(
      <LiftCTACard
        {...liftTargets(null)}
        nextWorkout={{
          dayName: "Pull — Lat Focus",
          dayType: "pull",
          exercises: [],
        }}
        // @ts-expect-error -- no rationale on Home (owner, 2026-09-09), so the card takes none
        purpose={purpose}
        muscleGroups="Back · Biceps"
        navigate={vi.fn()}
      />
    );
    expect(container).not.toHaveTextContent(purpose);
    // The hero says the muscles as words (`focusPhrase`).
    expect(container).toHaveTextContent("Back and biceps");
    cleanup();
    render(
      <SessionCommandCard
        sport="lift"
        eyebrow="Up next"
        title="Pull — Lat Focus"
        description={purpose}
        meta={["Back · Biceps"]}
      />
    );
    expect(screen.getByRole("region")).toHaveTextContent(purpose);
    expect(screen.getByRole("heading")).not.toHaveClass("truncate");
  });
  it("keeps Home compact while retaining the run explanation for detail surfaces", () => {
    const input = {
      type: "easy",
      templateId: "easy_30",
      currentWeek: 2,
      totalWeeks: 16,
      distance: "marathon",
    };
    const { purpose, weekLabel } = runSessionPresentation(input);
    const run = { templateId: "easy_30", completed: false } as ScheduledRunDay;
    const { container } = render(
      <RunCTACard
        unit="km"
        todayRun={run}
        startTarget={runStartTarget(run)}
        navigate={vi.fn()}
        // @ts-expect-error -- no rationale on Home (owner, 2026-09-09; DS4 call 5)
        purpose={purpose}
        weekLabel={weekLabel}
      />
    );
    expect(container).not.toHaveTextContent(runSessionExplainer(input)!);
    /* DS4 call 5: the plan's position may sit on Home's hero, as the
       kicker beside the date ("Week 3 of 16", `planPosition`), not as the
       phase line Train's detail carries. The reasons stay off it. */
    expect(container).not.toHaveTextContent("Base · week 3 of 16");
    const today = "2026-09-27";
    const state = {
      runPlan: {
        mode: "race_prep",
        currentWeek: 2,
        totalWeeks: 16,
        raceGoal: { distance: "marathon", targetDate: "2027-01-10" },
      },
    } as unknown as ProgramState;
    expect(heroKicker(runHeroDay, planPosition(state, today))).toBe(
      "Week 3 of 16"
    );
    expect(
      screen.getByRole("button", { name: "Start run" })
    ).toBeInTheDocument();
    cleanup();
    render(
      <SessionCommandCard
        sport="run"
        eyebrow="Today"
        title="Easy 30"
        description={purpose!}
        meta={[weekLabel!]}
      />
    );
    expect(screen.getByRole("region")).toHaveTextContent(
      runSessionExplainer(input)!
    );
    expect(screen.getByRole("region")).toHaveTextContent(weekLabel!);
  });
  it("omits invented programme reasons and calls an unplanned run a free run", () => {
    /* "Free run" is Train's own name for the same choice ("Start free
       run"). The card's title was "Start a run" while the whole card was
       the button; beside a separate Start it would say the same thing
       twice. */
    const navigate = vi.fn();
    const { container } = render(
      <RunCTACard
        unit="km"
        todayRun={null}
        startTarget={runStartTarget(null)}
        navigate={navigate}
      />
    );
    expect(screen.getByText("Free run")).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/week \d/i);
    fireEvent.click(screen.getByRole("button", { name: "Start run" }));
    // Starts the free run the card names (startOnArrival).
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/run?start=1");
  });
});

describe("Home session actions and metadata", () => {
  /* The run card's preview opens today's date in Train, so the date is
     pinned. Only Date is faked; no timers move. */
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 27, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the day's muscles and size, and preserves the selected lift day", () => {
    const navigate = vi.fn();
    const { container } = render(
      <LiftCTACard
        nextWorkout={{
          dayName: "Upper body",
          dayType: "upper",
          exercises: [{ name: "Bench" }, { name: "Row" }],
        }}
        muscleGroups="Chest · Back"
        {...liftTargets(2)}
        navigate={navigate}
      />
    );
    // With no last time to compare, the line under the picture is the
    // day's size and the first session's step (`liftHeroLine`).
    expect(container).toHaveTextContent("2 exercises");
    expect(container).toHaveTextContent("Chest and back");
    fireEvent.click(
      screen.getByRole("button", { name: "Open Upper body in Train" })
    );
    expect(navigate).toHaveBeenLastCalledWith("/program?day=2");
    fireEvent.click(screen.getByRole("button", { name: "Start workout" }));
    expect(navigate).toHaveBeenLastCalledWith("/program?day=2&start=1");
  });

  it("shows today's lead lift against the last time it was done", () => {
    // DS4 call 5: one number and its comparison, in the lifter's unit.
    const { container } = render(
      <LiftCTACard
        {...liftTargets(0)}
        nextWorkout={{
          dayName: "Pull A",
          dayType: "pull",
          exercises: [
            {
              name: "Barbell row",
              exerciseId: "barbell-row",
              sets: 3,
              reps: 8,
              weight: 35,
              lastPerformance: {
                sets: 3,
                reps: 8,
                weight: 32.5,
                completed: true,
              },
            },
          ],
        }}
        navigate={vi.fn()}
      />
    );
    expect(container).toHaveTextContent("Barbell row 35 kg × 8");
    expect(container).toHaveTextContent("2.5 kg more than last time");
    expect(container).not.toHaveTextContent(/Pick a weight/);
  });

  it("prices the session only when every exercise carries its sets", () => {
    const { container, rerender } = render(
      <LiftCTACard
        {...liftTargets(null)}
        nextWorkout={{
          dayName: "Upper body",
          dayType: "upper",
          exercises: [
            { name: "Bench", sets: 3, restSeconds: 90 },
            { name: "Row", sets: 3, restSeconds: 90 },
          ],
        }}
        navigate={vi.fn()}
      />
    );
    expect(container).toHaveTextContent(/2 exercises · about \d+ min/);
    rerender(
      <LiftCTACard
        {...liftTargets(null)}
        nextWorkout={{
          dayName: "Upper body",
          dayType: "upper",
          exercises: [{ name: "Bench", sets: 3 }, { name: "Row" }],
        }}
        navigate={vi.fn()}
      />
    );
    expect(container).toHaveTextContent("2 exercises");
    expect(container).not.toHaveTextContent(/min/);
  });

  it("titles a programme day as Train names it in its week", () => {
    const { container } = render(
      <LiftCTACard
        nextWorkout={{
          dayName: "Pull — Lat Focus",
          dayType: "pull",
          exercises: [],
        }}
        dayLabel="Pull B"
        {...liftTargets(3)}
        navigate={vi.fn()}
      />
    );
    /* The stored name never shows: whole, it broke at the dash on a phone
       ("Pull —" over "Lat Focus"). No rotation position rides the hero:
       the kicker beside the date gives the plan's week, and only a plan
       with a length (`planPosition`). */
    expect(screen.getByRole("heading", { name: "Pull B" })).toBeInTheDocument();
    expect(screen.queryByText("Planned for today")).toBeNull();
    expect(container).not.toHaveTextContent("Pull —");
    expect(container).not.toHaveTextContent(/Lat focus/i);
    expect(container).not.toHaveTextContent(/Session \d/);
    expect(
      screen.getByRole("button", { name: "Open Pull B in Train" })
    ).toBeInTheDocument();
  });

  it("splits a day the person named into its category and title", () => {
    render(
      <LiftCTACard
        {...liftTargets(null)}
        nextWorkout={{
          dayName: "Arms — Pump",
          dayType: "upper",
          exercises: [],
        }}
        dayLabel="Arms · Pump"
        navigate={vi.fn()}
      />
    );
    expect(screen.getByText("Arms")).toBeInTheDocument();
    expect(screen.getByText("Pump")).toBeInTheDocument();
  });

  it("names a long run in the reader's unit", () => {
    const longRun = {
      id: "sunday long",
      templateId: "long_6k",
      status: "planned",
    } as ScheduledRunDay;
    const { container, rerender } = render(
      <RunCTACard
        unit="mi"
        todayRun={longRun}
        startTarget={runStartTarget(longRun)}
        navigate={vi.fn()}
      />
    );
    expect(container).toHaveTextContent("Long 3.7 mi");
    expect(container).not.toHaveTextContent("6K");
    rerender(
      <RunCTACard
        unit="km"
        todayRun={longRun}
        startTarget={runStartTarget(longRun)}
        navigate={vi.fn()}
      />
    );
    expect(container).toHaveTextContent("Long 6K");
  });

  it("states the dose it is given and preserves the planned run identity", () => {
    // Run21 (5): the dose is `todaySession`'s; a timed run states its time.
    const navigate = vi.fn();
    const { container } = render(
      <RunCTACard
        unit="km"
        todayRun={
          {
            id: "planned run",
            templateId: "easy_30",
            status: "planned",
          } as ScheduledRunDay
        }
        startTarget={runStartTarget({
          id: "planned run",
          templateId: "easy_30",
          status: "planned",
        } as ScheduledRunDay)}
        navigate={navigate}
        dose="30 min"
      />
    );
    expect(container).toHaveTextContent("30 min");
    expect(container).not.toHaveTextContent(/about/i);
    fireEvent.click(screen.getByRole("button", { name: "Start run" }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith(
      "/run?template=easy_30&scheduledRunId=planned%20run&start=1"
    );
  });

  it("a completed run still opens its programme review and cannot start again", () => {
    const navigate = vi.fn();
    render(
      <RunCTACard
        unit="km"
        todayRun={
          {
            id: "done",
            templateId: "easy_30",
            status: "completed_exact",
          } as ScheduledRunDay
        }
        startTarget={runStartTarget({
          id: "done",
          templateId: "easy_30",
          status: "completed_exact",
        } as ScheduledRunDay)}
        navigate={navigate}
      />
    );
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start run" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Open Easy 30 in Train" })
    );
    expect(navigate).toHaveBeenCalledExactlyOnceWith(
      "/program?tab=run&rday=2026-09-27"
    );
  });
});
