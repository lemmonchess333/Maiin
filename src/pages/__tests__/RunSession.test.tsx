/**
 * A run's own page (`/program/run/:date`, TrainWk1 call 2): what the day's
 * sheet held for a run, as a page Train's run card opens. Every action
 * the sheet offered is here, and one that lands goes back to Train as the
 * sheet closed. What each action does is `DayActionSheet.test.tsx`'s,
 * which draws the same content (`DayActionContent`).
 */
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
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

  it("sends a day with no run to Train's Run tab on that day", () => {
    h.engine = engine([]);
    open(`/program/run/${today}`);
    expect(screen.getByTestId("address")).toHaveTextContent(
      `/program?tab=run&rday=${today}`
    );
  });

  it("sends an address that names no real day to Train's Run tab", () => {
    // The shape of a date, but no day: it would read as one in February.
    for (const date of ["next-tuesday", "2026-13-45", "2026-02-30"]) {
      const { unmount } = open(`/program/run/${date}`);
      expect(screen.getByTestId("address"), date).toHaveTextContent(
        /^\/program\?tab=run$/
      );
      unmount();
    }
  });

  it("opens at its top", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    open(`/program/run/${today}`);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    scrollTo.mockRestore();
  });
});

/** A command held until the test lets it land. */
function held() {
  let land: (value: typeof APPLIED) => void = () => {};
  const command = vi.fn(
    () =>
      new Promise<typeof APPLIED>((resolve) => {
        land = resolve;
      })
  );
  return { command, land: () => land(APPLIED) };
}

describe("going back from a run's page opened from Train", () => {
  /* Home, then Train's Run tab, then the run's page, as the app's own
     history holds them: Back goes one step, to Train. */
  const train = `/program?tab=run&rday=${today}`;
  function openFromTrain() {
    return render(
      <MemoryRouter
        initialEntries={["/", train, `/program/run/${today}`]}
        initialIndex={2}
      >
        <Routes>
          <Route path="/" element={<Address />} />
          <Route path="/program" element={<Address />} />
          <Route
            path="/program/run/:date"
            element={
              <>
                <RunSession />
                <Address />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    );
  }
  beforeEach(() => {
    // `cameFromInApp`: the router keeps each entry's place on it.
    window.history.replaceState({ idx: 2 }, "");
  });
  afterEach(() => {
    window.history.replaceState(null, "");
  });

  it("runs a skip tapped twice once, and lands on Train, not past it", async () => {
    const skip = held();
    h.engine = { ...engine([runDay()]), skipRunDay: skip.command };
    openFromTrain();
    const button = screen.getByRole("button", { name: "Skip this run" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toBeDisabled();
    skip.land();
    await waitFor(() =>
      expect(screen.getByTestId("address")).toHaveTextContent(train)
    );
    // Settled there: nothing goes back a second time.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByTestId("address")).toHaveTextContent(train);
    expect(skip.command).toHaveBeenCalledTimes(1);
  });

  it("goes back once when Back comes before the skip lands", async () => {
    const skip = held();
    h.engine = { ...engine([runDay()]), skipRunDay: skip.command };
    openFromTrain();
    fireEvent.click(screen.getByRole("button", { name: "Skip this run" }));
    fireEvent.click(screen.getByRole("link", { name: "Train" }));
    await waitFor(() =>
      expect(screen.getByTestId("address")).toHaveTextContent(train)
    );
    skip.land();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByTestId("address")).toHaveTextContent(train);
    expect(skip.command).toHaveBeenCalledTimes(1);
  });

  it("goes back once for a second tap on Train", async () => {
    openFromTrain();
    const link = screen.getByRole("link", { name: "Train" });
    fireEvent.click(link);
    fireEvent.click(link);
    await waitFor(() =>
      expect(screen.getByTestId("address")).toHaveTextContent(train)
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByTestId("address")).toHaveTextContent(train);
  });
});
