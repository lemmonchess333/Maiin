/**
 * Home's run card on a half or full marathon plan past its free first week
 * (whole-app grill Q85): the planned session offers Pro in place of Start,
 * the race itself still starts, and so does a free run.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import RunCTACard from "../RunCTACard";
import type { ScheduledRunDay } from "@/features/program/runScheduler";
import { runStartTarget } from "@/lib/todaySession";

const h = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/homeAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/paywallAnalytics", () => ({ track: h.track }));

afterEach(() => {
  cleanup();
  h.track.mockClear();
});

function runDay(templateId: string, type: ScheduledRunDay["type"]) {
  return {
    id: `runday_${templateId}`,
    dayIndex: 2,
    templateId,
    type,
    completed: false,
    status: "planned",
    date: "2026-05-12",
    weekKey: "2026-05-10",
  } as ScheduledRunDay;
}

const LOCKED = { cta: "Try Pro free", raceName: "marathon" };

describe("RunCTACard on a locked race plan", () => {
  it("offers Pro for a planned session, and says why", () => {
    const navigate = vi.fn();
    const day = runDay("easy_30", "easy");
    render(
      <RunCTACard
        unit="km"
        todayRun={day}
        startTarget={runStartTarget(day)}
        navigate={navigate}
        planLocked={LOCKED}
      />
    );
    expect(screen.queryByRole("button", { name: "Start run" })).toBeNull();
    expect(
      screen.getByText("Your marathon plan continues with Pro")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try Pro free" }));
    expect(h.track).toHaveBeenCalledWith("paywall_cta_clicked", {
      source: "race_plan",
    });
    expect(navigate).toHaveBeenCalledWith("/upgrade?from=race_plan");
  });

  it("the race itself still starts", () => {
    const day = runDay("marathon_race", "race");
    render(
      <RunCTACard
        unit="km"
        todayRun={day}
        startTarget={runStartTarget(day)}
        navigate={vi.fn()}
        planLocked={LOCKED}
      />
    );
    expect(screen.getByRole("button", { name: "Start run" })).toBeVisible();
  });

  it("a free run with no planned session still starts", () => {
    render(
      <RunCTACard
        unit="km"
        todayRun={null}
        startTarget={runStartTarget(null)}
        navigate={vi.fn()}
        planLocked={LOCKED}
      />
    );
    expect(screen.getByRole("button", { name: "Start run" })).toBeVisible();
  });
});
