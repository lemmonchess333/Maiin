/**
 * A run's own page (`/program/run/:date`, TrainWk1 call 2): what the day's
 * sheet held for a run, as a page Train's run card opens. Every action
 * the sheet offered is here, and one that lands goes back to Train as the
 * sheet closed. What each action does is `DayActionSheet.test.tsx`'s,
 * which draws the same content (`DayActionContent`).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { UserProfile } from "@/lib/auth";
import type {
  ProgramState,
  ScheduledRunDay,
} from "@/features/program/programTypes";
import { APPLIED } from "@/features/program/programOutcome";
import { localDateString, localWeekKey } from "@/lib/dateHelpers";

const h = vi.hoisted(() => ({
  engine: null as Record<string, unknown> | null,
}));

vi.mock("@/features/program/useProgramEngine", () => ({
  useProgramEngine: () => h.engine,
}));
vi.mock("@/components/program/ProgramOfflineBanner", () => ({
  default: () => null,
}));
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));
vi.mock("@/hooks/useClaimMapForProgram", () => ({
  useClaimMapForProgram: () => ({
    claimMap: new Map(),
    unclaimedByDate: new Map(),
  }),
}));
vi.mock("@/features/program/useRollingSessionContexts", () => ({
  useRollingSessionContexts: () => null,
}));
const profile = {
  uid: "u1",
  displayName: "Alex",
  weekSchedule: Array.from({ length: 7 }, (_, day) => ({
    day,
    type: day === new Date().getDay() ? "run" : "rest",
  })),
} as UserProfile;
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "u1" }, profile }),
}));
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "u1" } },
}));

import RunSession from "../RunSession";

const today = localDateString(new Date());

function runDay(): ScheduledRunDay {
  return {
    id: "runday_today",
    dayIndex: new Date().getDay(),
    date: today,
    weekKey: localWeekKey(new Date()),
    templateId: "easy_30",
    type: "easy",
    completed: false,
    status: "planned",
  };
}

function engine(runDays: ScheduledRunDay[]) {
  return {
    programState: {
      goal: "recomp",
      currentPhase: "base",
      weekNumber: 1,
      splitType: "ppl",
      workouts: [],
      settings: { autoProgression: true, smallPlates: false },
      weekHistory: [],
      programSchemaVersion: 2,
      runDays,
    } as unknown as ProgramState,
    loading: false,
    recentLayoff: "none",
    recentRuns: [],
    overrideRunDay: vi.fn(),
    markManualComplete: vi.fn(async () => APPLIED),
    skipRunDay: vi.fn(async () => APPLIED),
    skipWorkoutDay: vi.fn(async () => APPLIED),
    restoreRunDay: vi.fn(async () => APPLIED),
    restoreWorkoutDay: vi.fn(async () => APPLIED),
    moveRunDay: vi.fn(async () => APPLIED),
  };
}

/** The address the page is at, as the test can read it. */
function Address() {
  const location = useLocation();
  return (
    <p data-testid="address">{`${location.pathname}${location.search}`}</p>
  );
}

function open(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/program/run/:date"
          element={
            <>
              <RunSession />
              <Address />
            </>
          }
        />
        <Route path="/program" element={<Address />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  h.engine = engine([runDay()]);
});

describe("a run's own page", () => {
  it("draws what the day's sheet held for the run, with no close button", () => {
    open(`/program/run/${today}`);
    expect(screen.getByText("Manage run")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Run actions" })
    ).toBeInTheDocument();
    for (const name of ["Mark as done", "Skip this run", "Move to another day"])
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Run template" })
    ).toBeEnabled();
    // The page's way back is its header's; the sheet's close is not drawn.
    expect(
      screen.queryByRole("button", { name: "Close" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Train" })).toBeInTheDocument();
  });

  it("marks the run done, then goes back to Train on its day", async () => {
    open(`/program/run/${today}`);
    fireEvent.click(screen.getByRole("button", { name: "Mark as done" }));
    await waitFor(() =>
      expect(screen.getByTestId("address")).toHaveTextContent(
        `/program?tab=run&rday=${today}`
      )
    );
    expect(h.engine?.markManualComplete).toHaveBeenCalledWith("runday_today");
  });

  it("skips the run, then goes back to Train", async () => {
    open(`/program/run/${today}`);
    fireEvent.click(screen.getByRole("button", { name: "Skip this run" }));
    await waitFor(() =>
      expect(screen.getByTestId("address")).toHaveTextContent(
        `/program?tab=run&rday=${today}`
      )
    );
    expect(h.engine?.skipRunDay).toHaveBeenCalledWith("runday_today");
  });

  it("shows only the run, never the day's lift", () => {
    open(`/program/run/${today}`);
    expect(
      screen.queryByRole("region", { name: "Lift actions" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Manage day")).not.toBeInTheDocument();
  });

  it("says so on a day with no run", () => {
    h.engine = engine([]);
    open(`/program/run/${today}`);
    expect(
      screen.getByText("No run scheduled for this day.")
    ).toBeInTheDocument();
  });

  it("sends an address that names no date to Train's Run tab", () => {
    open("/program/run/next-tuesday");
    expect(screen.getByTestId("address")).toHaveTextContent(
      /^\/program\?tab=run$/
    );
  });
});
