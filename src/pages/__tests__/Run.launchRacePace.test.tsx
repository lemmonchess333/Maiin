/**
 * The Run screen's launch card names a long run's race-pace finish
 * (Run21 (2)), by the gate that gave the run its race-pace block, on the
 * same inputs, and gives it its reason.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Run from "../Run";
import { localDateString, localWeekKey } from "@/lib/dateHelpers";
import type { ProgramState } from "@/features/program/programTypes";

let profile: Record<string, unknown> = {};
let programState: ProgramState | null = null;

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ profile }),
  useUidForStorageKey: () => "launch-test",
  useUid: () => "launch-test",
}));
vi.mock("@/features/program/useProgram", () => ({
  useProgram: () => ({ programState, loading: false }),
}));
vi.mock("@/hooks/useDistanceUnit", () => ({ useDistanceUnit: () => "km" }));
vi.mock("@/hooks/useLastRunType", () => ({ useLastRunType: () => null }));
vi.mock("@/hooks/useGPS", () => ({
  useGPS: () => ({
    points: [],
    distance: 0,
    stop: vi.fn(),
    currentPoint: null,
  }),
}));
vi.mock("@/hooks/useRunTimer", () => ({
  useRunTimer: () => ({
    elapsed: 0,
    isRunning: false,
    formatTime: () => "0:00",
  }),
}));
vi.mock("@/hooks/useWakeLock", () => ({
  useWakeLock: () => ({ request: vi.fn(), release: vi.fn() }),
}));
vi.mock("@/hooks/useHeartRate", () => ({
  useHeartRate: () => ({ bpm: null }),
}));
vi.mock("@/hooks/useAudioCues", () => ({ useAudioCues: () => ({}) }));
vi.mock("@/hooks/useSessionPlayer", () => ({
  useSessionPlayer: () => ({ state: { index: 0 } }),
}));
vi.mock("@/components/run/RunMapLazy", () => ({ default: () => null }));
vi.mock("@/components/run/RouteSetupSection", () => ({ default: () => null }));
vi.mock("@/components/run/RunLaunchCard", () => ({
  default: ({
    purpose,
    racePace,
  }: {
    purpose?: string | null;
    racePace?: { kind: string; blockKm?: number } | null;
  }) => (
    <div>
      <p data-testid="finish">
        {racePace?.kind === "finish"
          ? `${racePace.blockKm} km`
          : (racePace?.kind ?? "none")}
      </p>
      <p data-testid="purpose">{purpose}</p>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  programState = null;
  localStorage.clear();
});

/** Today's run, in week 6 of a 10-week half plan: the build. */
function launchLong(
  targetTimeS?: number,
  templateId = "long_15k",
  type = "long",
  tier: "pro" | "free" = "pro"
) {
  const today = new Date();
  const raceGoal = { distance: "half", targetDate: "2099-04-18" };
  profile = {
    // A half marathon plan in its sixth week is Pro (whole-app grill Q85);
    // a free account's planned runs open as free runs.
    subscriptionTier: tier,
    uid: "launch-test",
    runMode: "race_prep",
    raceGoal: { ...raceGoal, ...(targetTimeS ? { targetTimeS } : {}) },
  };
  programState = {
    runDays: [
      {
        id: "runday_today",
        dayIndex: today.getDay(),
        date: localDateString(today),
        weekKey: localWeekKey(today),
        templateId,
        type,
        completed: false,
        status: "planned",
      },
    ],
    runPlan: { mode: "race_prep", raceGoal, totalWeeks: 10, currentWeek: 5 },
  } as unknown as ProgramState;
  render(
    <MemoryRouter
      initialEntries={[
        `/run?template=${templateId}&scheduledRunId=runday_today`,
      ]}
    >
      <Routes>
        <Route path="/run" element={<Run />} />
      </Routes>
    </MemoryRouter>
  );
  // A free account past the plan's first week gets no planned-run launch
  // card at all (Q85): its run opens as a free run.
  if (tier === "free") {
    return {
      finish: screen.queryByTestId("finish")?.textContent ?? null,
      purpose: "",
    };
  }
  return {
    finish: screen.getByTestId("finish").textContent,
    purpose: screen.getByTestId("purpose").textContent ?? "",
  };
}

describe("Run launch card — a long run that finishes at race pace", () => {
  it("names the finish the run will play, and why it's in the week", () => {
    const { finish, purpose } = launchLong(6330);
    // 15 km: the last 5 at the goal pace, as the run's own block.
    expect(finish).toBe("5 km");
    expect(purpose).toMatch(/rehearses race day/);
  });

  it("names a tempo at the goal pace, and why it's in the week", () => {
    const { finish, purpose } = launchLong(6330, "tempo_20", "tempo");
    expect(finish).toBe("tempo");
    expect(purpose).toMatch(/what race pace feels like/);
  });

  it("a free account past the plan's first week runs it as a free run (Q85)", () => {
    const { finish } = launchLong(6330, "long_15k", "long", "free");
    expect(finish).toBeNull();
  });

  it("names none without a goal time", () => {
    const { finish, purpose } = launchLong();
    expect(finish).toBe("none");
    expect(purpose).toMatch(/^The week’s anchor run/);
  });
});
