/**
 * Home's day peek on a hot day (heatAdjustment.ts): today's run still to do
 * says it is hot, by the rule of thumb's range, with MET Norway's credit,
 * and that the run can be adjusted for heat as it starts; the offer itself
 * is the run page's. Another day, a run already done and a mild day say
 * nothing of heat, and only today's run to do reads the weather.
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
import { restoreRealTimers } from "@/test/fakeTimers";

const weather = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/weather", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/weather")>()),
  getCurrentWeather: () => weather.get(),
}));
const distance = vi.hoisted(() => ({ unit: "km" as "km" | "mi" }));
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => distance.unit,
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
  distance.unit = "km";
});
afterEach(async () => {
  await restoreRealTimers();
  cleanup();
});

describe("DayPeekCard on a hot day", () => {
  it("says it is hot on today's run still to do, and where it can be adjusted", async () => {
    weather.get.mockResolvedValue(HOT);
    const today = new Date();
    peek(localDateString(today), [runDayOn(today)]);
    const note = await screen.findByRole("note", { name: "Hot day" });
    expect(note).toHaveTextContent("Hot today");
    expect(note).toHaveTextContent(
      "By a common rule of thumb, this heat slows the same effort by 6–8%."
    );
    expect(note).toHaveTextContent(
      "You can adjust the run for heat as you start it."
    );
    expect(note).toHaveTextContent("Weather data from MET Norway");
    // The offer and the swap are the run page's, where the run starts.
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

describe("DayPeekCard: today's coolest hour (Run26 (5))", () => {
  /** Today at the hour given, on the device's clock. */
  function today(hour: number): Date {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour);
  }
  /** The next hours from 13:00 as the callable sends them: 33 °C through
   *  the afternoon, 24 °C at 21:00. */
  function hoursFrom13() {
    return [14, 15, 16, 17, 18, 19, 20, 21, 22, 23].map((h) => ({
      at: today(h).getTime(),
      temperature: h === 21 ? 24 : 33,
      dewPoint: h === 21 ? 20 : 24,
    }));
  }
  beforeEach(() => {
    // 13:00 today, so the evening's hours are today's in every time zone.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(today(13));
  });

  it("names it under the heat line on a hot day", async () => {
    weather.get.mockResolvedValue({ ...HOT, hours: hoursFrom13() });
    peek(localDateString(), [runDayOn(new Date())]);
    const note = await screen.findByRole("note", { name: "Hot day" });
    expect(note).toHaveTextContent(
      "Coolest at 21:00, 24 °C against 32 °C now."
    );
  });

  it("names it in °F for a runner who reads miles", async () => {
    distance.unit = "mi";
    weather.get.mockResolvedValue({ ...HOT, hours: hoursFrom13() });
    peek(localDateString(), [runDayOn(new Date())]);
    const note = await screen.findByRole("note", { name: "Hot day" });
    expect(note).toHaveTextContent(
      "Coolest at 21:00, 75 °F against 90 °F now."
    );
  });

  it("names nothing from a server that sends no hours, and still says it is hot", async () => {
    weather.get.mockResolvedValue(HOT);
    peek(localDateString(), [runDayOn(new Date())]);
    const note = await screen.findByRole("note", { name: "Hot day" });
    expect(note).toHaveTextContent("Hot today");
    expect(note).not.toHaveTextContent(/Coolest/);
  });

  it("names nothing on a mild day, however cool the evening", async () => {
    weather.get.mockResolvedValue({ ...MILD, hours: hoursFrom13() });
    peek(localDateString(), [runDayOn(new Date())]);
    await vi.waitFor(() => expect(weather.get).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByText(/Coolest/)).toBeNull();
    expect(screen.queryByRole("note", { name: "Hot day" })).toBeNull();
  });
});
