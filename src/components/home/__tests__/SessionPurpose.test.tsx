import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import LiftCTACard from "../LiftCTACard";
import RunCTACard from "../RunCTACard";
import SessionCommandCard from "@/components/program/SessionCommandCard";
import {
  runSessionPresentation,
  runSessionExplainer,
} from "@/lib/runSessionExplainer";
import { liftSessionExplainer } from "@/lib/liftSessionExplainer";
import type { ScheduledRunDay } from "@/features/program/runScheduler";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/homeAnalytics", () => ({ track: vi.fn() }));

describe("session purpose command surfaces", () => {
  it("keeps lift rationale off Home while preserving the muscle meta", () => {
    const purpose = liftSessionExplainer(
      { weekNumber: 3, currentPhase: "progression" },
      "2026-09-06"
    )!;
    render(
      <LiftCTACard
        nextWorkout={{
          dayName: "Pull — Lat Focus",
          dayType: "pull",
          exercises: [],
        }}
        purpose={purpose}
        muscleGroups="Back · Biceps"
        navigate={vi.fn()}
      />
    );
    expect(screen.getByRole("button")).not.toHaveTextContent(purpose);
    expect(screen.getByRole("button")).toHaveTextContent("Back · Biceps");
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
    render(
      <RunCTACard
        todayRun={run}
        navigate={vi.fn()}
        purpose={purpose}
        weekLabel={weekLabel}
      />
    );
    expect(screen.getByRole("button")).not.toHaveTextContent(
      runSessionExplainer(input)!
    );
    expect(screen.getByRole("button")).not.toHaveTextContent(
      "Base · week 3 of 16"
    );
    expect(screen.getByRole("button")).toHaveTextContent("View run");
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
  it("omits invented programme reasons and gives a free run its neutral existing choice", () => {
    render(<RunCTACard todayRun={null} navigate={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveTextContent("Start a run");
    expect(screen.getByRole("button")).not.toHaveTextContent(/week \d/i);
  });
});

describe("Home session actions and metadata", () => {
  it("shows an exercise count with muscle groups and preserves the selected lift day", () => {
    const navigate = vi.fn();
    render(
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
    expect(screen.getByRole("button")).toHaveTextContent(
      "2 exercises · Chest · Back"
    );
    fireEvent.click(screen.getByRole("button"));
    expect(navigate).toHaveBeenCalledWith("/program?day=2");
  });

  it("uses the real template duration and preserves the planned run identity", () => {
    const navigate = vi.fn();
    render(
      <RunCTACard
        todayRun={
          {
            id: "planned run",
            templateId: "easy_30",
            status: "planned",
          } as ScheduledRunDay
        }
        navigate={navigate}
      />
    );
    expect(screen.getByRole("button")).toHaveTextContent("30 min");
    fireEvent.click(screen.getByRole("button"));
    expect(navigate).toHaveBeenCalledWith(
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
    expect(screen.getByRole("button")).toHaveTextContent("Completed");
    expect(screen.queryByText("Go")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(navigate).toHaveBeenCalledWith("/program?tab=run");
  });
});
