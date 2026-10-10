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

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/homeAnalytics", () => ({ track: vi.fn() }));

describe("session purpose command surfaces", () => {
  it("keeps lift rationale off Home while preserving the muscle meta", () => {
    const purpose = "Week 3 of 4 · progression follows your sets";
    const { container } = render(
      <LiftCTACard
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
    expect(container).toHaveTextContent("Back · Biceps");
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
        todayRun={run}
        navigate={vi.fn()}
        // @ts-expect-error -- no rationale or plan week on Home (owner, 2026-09-09)
        purpose={purpose}
        weekLabel={weekLabel}
      />
    );
    expect(container).not.toHaveTextContent(runSessionExplainer(input)!);
    expect(container).not.toHaveTextContent("Base · week 3 of 16");
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
      <RunCTACard todayRun={null} navigate={navigate} />
    );
    expect(screen.getByText("Free run")).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/week \d/i);
    fireEvent.click(screen.getByRole("button", { name: "Start run" }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/run");
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

  it("shows an exercise count with muscle groups and preserves the selected lift day", () => {
    const navigate = vi.fn();
    const { container } = render(
      <LiftCTACard
        nextWorkout={{
          dayName: "Upper body",
          dayType: "upper",
          exercises: [{ name: "Bench" }, { name: "Row" }],
        }}
        muscleGroups="Chest · Back"
        dayIndex={2}
        navigate={navigate}
      />
    );
    expect(container).toHaveTextContent("2 exercises");
    expect(container).toHaveTextContent("Chest · Back");
    fireEvent.click(
      screen.getByRole("button", { name: "Open Upper body in Train" })
    );
    expect(navigate).toHaveBeenLastCalledWith("/program?day=2");
    fireEvent.click(screen.getByRole("button", { name: "Start workout" }));
    expect(navigate).toHaveBeenLastCalledWith("/program?day=2&start=1");
  });

  it("prices the session only when every exercise carries its sets", () => {
    const { container, rerender } = render(
      <LiftCTACard
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

  it("splits a programme day's name into its category and focus", () => {
    const { container } = render(
      <LiftCTACard
        nextWorkout={{
          dayName: "Pull — Lat Focus",
          dayType: "pull",
          exercises: [],
        }}
        dayIndex={3}
        navigate={vi.fn()}
      />
    );
    /* The whole name as a title broke at the dash on a phone ("Pull —"
       over "Lat Focus"). No rotation position rides the eyebrow: Home
       shows the session and its dose (owner direction, 2026-09-09). */
    expect(screen.getByText("Pull")).toBeInTheDocument();
    expect(screen.getByText("Lat focus")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("Pull —");
    expect(container).not.toHaveTextContent(/Session \d/);
  });

  it("states the dose it is given and preserves the planned run identity", () => {
    // Run21 (5): the dose is `todaySession`'s; a timed run states its time.
    const navigate = vi.fn();
    const { container } = render(
      <RunCTACard
        todayRun={
          {
            id: "planned run",
            templateId: "easy_30",
            status: "planned",
          } as ScheduledRunDay
        }
        navigate={navigate}
        dose="30 min"
      />
    );
    expect(container).toHaveTextContent("30 min");
    expect(container).not.toHaveTextContent(/about/i);
    fireEvent.click(screen.getByRole("button", { name: "Start run" }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith(
      "/run?template=easy_30&scheduledRunId=planned%20run"
    );
  });

  it("a completed run still opens its programme review and cannot start again", () => {
    const navigate = vi.fn();
    render(
      <RunCTACard
        todayRun={
          {
            id: "done",
            templateId: "easy_30",
            status: "completed_exact",
          } as ScheduledRunDay
        }
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
