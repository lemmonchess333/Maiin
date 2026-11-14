/**
 * Home's day peek on a hot day (Pgm8 (E8)): today's run still to do says to
 * run by feel, with MET Norway's credit, and offers nothing else here (the
 * swap is the run page's). Another day, a run already done and a mild day
 * say nothing of heat, and only today's run to do reads the weather.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DayPeekCard from "@/components/home/DayPeekCard";
import type { UserProfile } from "@/lib/auth";
import type {
  ProgramState,
  ScheduledRunDay,
} from "@/features/program/programTypes";
import type { ClaimState } from "@/lib/scheduledRunCompletion";
import { localDateString, localWeekKey } from "@/lib/dateHelpers";

const weather = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/weather", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/weather")>()),
  getCurrentWeather: () => weather.get(),
}));
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));

const HOT = {
  temperature: 32,
  feelsLike: 36,
  humidity: 70,
  windSpeed: 10,
  weatherCode: 0,
  description: "Clear sky",
};
const MILD = { ...HOT, temperature: 15, feelsLike: 15, humidity: 50 };

function runDayOn(date: Date, overrides: Partial<ScheduledRunDay> = {}) {
  return {
    id: `runday_${localDateString(date)}`,
    dayIndex: date.getDay(),
    date: localDateString(date),
    weekKey: localWeekKey(date),
    templateId: "tempo_30",
    type: "tempo",
    completed: false,
    status: "planned",
    ...overrides,
  } as ScheduledRunDay;
}

function programWith(runDays: ScheduledRunDay[]): ProgramState {
  return {
    goal: "recomp",
    currentPhase: "base",
    weekNumber: 1,
    splitType: "ppl",
    workouts: [],
    fatigueScore: 0,
    updatedAt: Date.now(),
    settings: { autoProgression: true, smallPlates: false },
    weekHistory: [],
    programSchemaVersion: 2,
    runDays,
  } as ProgramState;
}

const profile = {
  uid: "u-1",
  displayName: "Test",
  email: "t@example.com",
  weekSchedule: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, type: "run" })),
} as unknown as UserProfile;

function peek(dateKey: string, runDays: ScheduledRunDay[]) {
  render(
    <MemoryRouter>
      <DayPeekCard
        todayKey={localDateString()}
        dateKey={dateKey}
        profile={profile}
        programState={programWith(runDays)}
        claimMap={new Map<string, ClaimState>()}
        extras={[]}
        workouts={[]}
        dailyTotals={{
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          mealCount: 0,
        }}
        onClose={vi.fn()}
      />
    </MemoryRouter>
  );
}

beforeEach(() => {
  weather.get.mockReset();
});
afterEach(() => cleanup());

describe("DayPeekCard on a hot day", () => {
  it("says to run by feel on today's run still to do, with MET Norway's credit", async () => {
    weather.get.mockResolvedValue(HOT);
    const today = new Date();
    peek(localDateString(today), [runDayOn(today)]);
    const note = await screen.findByRole("note", { name: "Hot day" });
    expect(note).toHaveTextContent("Hot today: run by feel, not by pace");
    expect(note).toHaveTextContent("Weather data from MET Norway");
    // The swap is the run page's, where the run starts.
    expect(note.querySelector("button")).toBeNull();
  });

  it("says nothing of heat on a mild day", async () => {
    weather.get.mockResolvedValue(MILD);
    const today = new Date();
    peek(localDateString(today), [runDayOn(today)]);
    await vi.waitFor(() => expect(weather.get).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByRole("note", { name: "Hot day" })).toBeNull();
  });

  it("reads no weather for another day's run, or for today's run once done", () => {
    weather.get.mockResolvedValue(HOT);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    peek(localDateString(tomorrow), [runDayOn(tomorrow)]);
    cleanup();
    const today = new Date();
    peek(localDateString(today), [runDayOn(today, { status: "skipped" })]);
    expect(weather.get).not.toHaveBeenCalled();
    expect(screen.queryByRole("note", { name: "Hot day" })).toBeNull();
  });
});
