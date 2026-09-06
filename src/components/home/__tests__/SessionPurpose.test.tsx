import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import LiftCTACard from "../LiftCTACard";
import RunCTACard from "../RunCTACard";
import SessionCommandCard from "@/components/program/SessionCommandCard";
import {
  runSessionPresentation,
  runSessionExplainer,
} from "@/lib/runSessionExplainer";
import { liftSessionExplainer } from "@/lib/liftSessionExplainer";
import type { ScheduledRunDay } from "@/features/program/runScheduler";

describe("session purpose command surfaces", () => {
  it("shows the same lift reason on Home and Program while preserving the muscle meta", () => {
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
    expect(screen.getByRole("button")).toHaveTextContent(purpose);
    expect(screen.getByText("Back · Biceps")).toBeInTheDocument();
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
  it("uses the Manage-sheet explanation verbatim on both run command surfaces", () => {
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
    expect(screen.getByRole("button")).toHaveTextContent(
      runSessionExplainer(input)!
    );
    expect(screen.getByRole("button")).toHaveTextContent("Base · week 3 of 16");
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
    expect(screen.getByRole("button")).toHaveTextContent(
      "Free running · your choice today"
    );
    expect(screen.getByRole("button")).not.toHaveTextContent(/week \d/i);
  });
});
