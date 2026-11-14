/**
 * Home's run hero reads the weather ahead for a tempo or interval session
 * still to start (Pgm8 (E8)), so Start finds it known and the run page can
 * offer a hot day's easy run without a wait (startOnArrival). It reads
 * nothing for any other run, and the hero shows nothing of it.
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
  it("reads it for a tempo or interval session still to start", () => {
    hero(runDay("tempo_30", "tempo"));
    expect(weather.get).toHaveBeenCalledOnce();
    cleanup();
    hero(runDay("5x1k", "intervals"));
    expect(weather.get).toHaveBeenCalledTimes(2);
  });

  it("reads nothing for an easy run, or for a session already done", () => {
    hero(runDay("easy_30", "easy"));
    cleanup();
    hero(runDay("tempo_30", "tempo", "completed_exact"));
    expect(weather.get).not.toHaveBeenCalled();
  });

  it("shows nothing of it on the hero", () => {
    hero(runDay("tempo_30", "tempo"));
    expect(screen.queryByText(/by feel|Hot today/)).toBeNull();
  });
});
