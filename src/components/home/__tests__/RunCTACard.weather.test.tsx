/**
 * Home's run hero reads the weather ahead for a planned run still to start
 * (heatAdjustment.ts), so Start finds it known and the run page can offer
 * a hot day's adjustment without a wait (startOnArrival). It reads nothing
 * for a run already done, a race or a free run, and the hero shows nothing
 * of it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import RunCTACard from "../RunCTACard";
import type { ScheduledRunDay } from "@/features/program/runScheduler";
import { runStartTarget } from "@/lib/todaySession";

const weather = vi.hoisted(() => ({ get: vi.fn(async () => null) }));
vi.mock("@/lib/weather", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/weather")>()),
  getCurrentWeather: () => weather.get(),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/homeAnalytics", () => ({ track: vi.fn() }));

beforeEach(() => weather.get.mockClear());
afterEach(cleanup);

function runDay(
  templateId: string,
  type: ScheduledRunDay["type"],
  status = "planned"
) {
  return {
    id: `runday_${templateId}`,
    dayIndex: 2,
    templateId,
    type,
    completed: false,
    status,
    date: "2026-05-12",
    weekKey: "2026-05-10",
  } as ScheduledRunDay;
}

function hero(day: ScheduledRunDay) {
  render(
    <RunCTACard
      unit="km"
      todayRun={day}
      startTarget={runStartTarget(day)}
      navigate={vi.fn()}
    />
  );
}

describe("RunCTACard — the weather ahead", () => {
  it("reads it for a planned run still to start", () => {
    hero(runDay("tempo_30", "tempo"));
    expect(weather.get).toHaveBeenCalledOnce();
    cleanup();
    hero(runDay("5x1k", "intervals"));
    cleanup();
    hero(runDay("easy_30", "easy"));
    cleanup();
    hero(runDay("long_15k", "long"));
    expect(weather.get).toHaveBeenCalledTimes(4);
  });

  it("reads nothing for a session already done, or a race", () => {
    hero(runDay("tempo_30", "tempo", "completed_exact"));
    cleanup();
    hero(runDay("5k_race", "race"));
    expect(weather.get).not.toHaveBeenCalled();
  });

  it("shows nothing of it on the hero", () => {
    hero(runDay("tempo_30", "tempo"));
    expect(screen.queryByText(/by feel|Hot today/)).toBeNull();
  });
});
