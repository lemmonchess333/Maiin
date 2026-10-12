/**
 * The Run screen's launch card says why a planned run is in its week, and
 * names the quality sessions only when that week holds one: a returning
 * runner's weeks hold no tempo or intervals (Run15), so they can't be an
 * easy day's reason (Run21 (3)).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Run from "../Run";
import { localDateString, localWeekKey } from "@/lib/dateHelpers";
import type { ProgramState } from "@/features/program/programTypes";

const RACE_GOAL = { distance: "10k", targetDate: "2099-04-18" };
let programState: ProgramState | null = null;

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    profile: { uid: "launch-test", runMode: "race_prep", raceGoal: RACE_GOAL },
  }),
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
  default: ({ purpose }: { purpose?: string | null }) => (
    <p data-testid="purpose">{purpose}</p>
  ),
}));

afterEach(() => {
  cleanup();
  programState = null;
  localStorage.clear();
});

function launchEasyDay(otherTemplateId: string) {
  const today = new Date();
  const later = new Date(today);
  later.setDate(later.getDate() + 2);
  const weekKey = localWeekKey(today);
  const day = (id: string, date: Date, templateId: string) => ({
    id,
    dayIndex: date.getDay(),
    date: localDateString(date),
    weekKey,
    templateId,
    type: RUN_TYPES[templateId],
    completed: false,
    status: "planned" as const,
  });
  programState = {
    runDays: [
      day("runday_today", today, "easy_30"),
      day("runday_other", later, otherTemplateId),
    ],
    runPlan: {
      mode: "race_prep",
      raceGoal: RACE_GOAL,
      totalWeeks: 12,
      currentWeek: 6,
    },
  } as unknown as ProgramState;
  render(
    <MemoryRouter
      initialEntries={["/run?template=easy_30&scheduledRunId=runday_today"]}
    >
      <Routes>
        <Route path="/run" element={<Run />} />
      </Routes>
    </MemoryRouter>
  );
  return screen.getByTestId("purpose").textContent ?? "";
}

const RUN_TYPES: Record<string, string> = {
  easy_30: "easy",
  easy_40: "easy",
  tempo_20: "tempo",
};

describe("Run launch card — why this run", () => {
  it("names the quality sessions in a week that holds one", () => {
    expect(launchEasyDay("tempo_20")).toMatch(
      /it makes the quality sessions work/
    );
  });

  it("gives a reason true of any week when it holds none", () => {
    const why = launchEasyDay("easy_40");
    expect(why).toMatch(/most of your running is easy/);
    expect(why).not.toMatch(/quality/);
  });
});
