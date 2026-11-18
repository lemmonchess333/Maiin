/**
 * A lift's own page (`/program/lift/:day`, TrainWk1 call 2): the session
 * Train's Lift tab shows under its day strip, alone, with everything a
 * person could do to it there. It reads the engine the `/program` route
 * holds (`useProgramEngine`), mocked here.
 */
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ComponentProps } from "react";
import type WorkoutSessionType from "@/components/WorkoutSession";
import { generateProgram } from "@/features/program/programEngine";
import type { ProgramState } from "@/features/program/programTypes";
import { liftWeekDayNames } from "@/lib/liftDayLabel";
import { WORKOUT } from "@/test/journeyScreens";

type SessionProps = ComponentProps<typeof WorkoutSessionType>;
const h = vi.hoisted(() => ({
  session: null as SessionProps | null,
  engine: null as Record<string, unknown> | null,
}));

vi.mock("@/features/program/useProgramEngine", () => ({
  useProgramEngine: () => h.engine,
}));
vi.mock("@/components/WorkoutSession", () => ({
  default: (props: SessionProps) => {
    h.session = props;
    return <div>Workout for {props.dayLabel}</div>;
  },
}));
// The picker's own suite is its own; here only that the page offers it.
vi.mock("@/components/program/ExercisePicker", () => ({
  default: ({ open, headerTitle }: { open: boolean; headerTitle: string }) =>
    open ? <div role="dialog" aria-label={headerTitle} /> : null,
}));
vi.mock("@/components/program/ProgramOfflineBanner", () => ({
  default: () => null,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "u1" },
    profile: { uid: "u1", experience: "intermediate" },
    refreshProfile: vi.fn(),
  }),
}));
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "u1" } },
}));
vi.mock("@/hooks/useWorkouts", () => ({
  useWorkouts: () => ({ workouts: [], loading: false }),
}));
vi.mock("@/hooks/useSessionsInFlight", () => ({
  useSessionsInFlight: () => ({
    drafts: [],
    run: null,
    routines: new Map(),
    refresh: vi.fn(),
  }),
}));
vi.mock("@/features/program/useEasierTodayRecommendation", () => ({
  useHardRunBefore: () => () => false,
  useEasierTodayRecommendation: () => null,
}));

import LiftSession from "../LiftSession";

/** The address the page is at, as the test can read it. */
function Address() {
  const location = useLocation();
  return (
    <p data-testid="address">{`${location.pathname}${location.search}`}</p>
  );
}

function plan(): ProgramState {
  const { workouts, splitType } = generateProgram(3, undefined, "hypertrophy");
  return {
    weekNumber: 2,
    workouts,
    splitType,
    currentPhase: "progression",
  } as unknown as ProgramState;
}

function engine(programState: ProgramState) {
  return {
    programState,
    loading: false,
    readiness: "ready",
    recentLayoff: "none",
    recentRuns: [],
    completeWorkoutDay: vi.fn(),
    setNextWorkout: vi.fn(async () => ({ status: "applied" })),
    skipWorkoutDay: vi.fn(async () => ({ status: "applied" })),
    reorderDayExercises: vi.fn(),
    removeExerciseFromDay: vi.fn(),
    addExercisesToDayCmd: vi.fn(),
    replaceExerciseInDay: vi.fn(),
    restoreRemovedExercise: vi.fn(),
  };
}

function open(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/program/lift/:day"
          element={
            <>
              <LiftSession />
              <Address />
            </>
          }
        />
        <Route path="/program" element={<Address />} />
      </Routes>
    </MemoryRouter>
  );
}

let state: ProgramState;
beforeEach(() => {
  h.session = null;
  state = plan();
  h.engine = engine(state);
});

const names = () => liftWeekDayNames(state.workouts.map((w) => w.dayName));

describe("a lift's own page", () => {
  it("draws the session as Train does: its card, its exercises, its Start", () => {
    open("/program/lift/0");
    // The card names the session; the page's h1 says the same for a
    // reader landing here, and draws no large title above the card.
    expect(
      screen.getByRole("heading", { level: 1, name: names()[0] })
    ).toHaveClass("sr-only");
    expect(
      screen.getByRole("heading", { level: 3, name: names()[0] })
    ).toBeInTheDocument();
    for (const exercise of state.workouts[0].exercises) {
      expect(
        screen.getByRole("button", {
          name: `More options for ${exercise.name}`,
        })
      ).toBeInTheDocument();
    }
    expect(
      screen.getByRole("button", { name: WORKOUT.start })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add exercise" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Short on time?" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Skip session" })
    ).toBeInTheDocument();
  });

  it("starts the workout over the page, for its own day", () => {
    open("/program/lift/0");
    fireEvent.click(screen.getByRole("button", { name: WORKOUT.start }));
    expect(screen.getByText(`Workout for ${names()[0]}`)).toBeInTheDocument();
    expect(h.session?.dayIndex).toBe(0);
    expect(h.session?.resumeDraft).toBe(false);
  });

  it("opens the workout at once from a start link, and drops the link", () => {
    open("/program/lift/0?start=1");
    expect(screen.getByText(`Workout for ${names()[0]}`)).toBeInTheDocument();
    expect(screen.getByTestId("address")).toHaveTextContent(
      /^\/program\/lift\/0$/
    );
  });

  it("offers a later session to make next, and makes it next", () => {
    open("/program/lift/1");
    expect(
      screen.queryByRole("button", { name: WORKOUT.start })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Make this next" }));
    expect(h.engine?.setNextWorkout).toHaveBeenCalledWith(1);
  });

  it("skips the session and moves on to the one up next, in its place", async () => {
    open("/program/lift/0");
    fireEvent.click(screen.getByRole("button", { name: "Skip session" }));
    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
    await waitFor(() =>
      expect(screen.getByTestId("address")).toHaveTextContent(
        /^\/program\/lift\/1$/
      )
    );
    expect(h.engine?.skipWorkoutDay).toHaveBeenCalledWith(0);
  });

  it("reorders the exercises from its header, and Done ends it", () => {
    open("/program/lift/0");
    const exercise = state.workouts[0].exercises[0].name;
    fireEvent.click(screen.getByRole("button", { name: "Reorder exercises" }));
    // Drag mode: the rows take their handles, and the menus give way.
    expect(
      screen.queryByRole("button", { name: `More options for ${exercise}` })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(
      screen.getByRole("button", { name: `More options for ${exercise}` })
    ).toBeInTheDocument();
  });

  it("opens Add exercise for its own day", () => {
    open("/program/lift/0");
    fireEvent.click(screen.getByRole("button", { name: "Add exercise" }));
    expect(
      screen.getByRole("dialog", { name: "Add exercise" })
    ).toBeInTheDocument();
  });

  it("goes back to Train on that day when it was opened from outside the app", () => {
    open("/program/lift/1");
    fireEvent.click(screen.getByRole("link", { name: "Train" }));
    expect(screen.getByTestId("address")).toHaveTextContent(
      "/program?tab=lift&day=1"
    );
  });

  it("sends a day the plan does not have to Train", () => {
    open("/program/lift/9");
    expect(screen.getByTestId("address")).toHaveTextContent(/^\/program$/);
  });

  it("opens at its top", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    open("/program/lift/0");
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    scrollTo.mockRestore();
  });
});

describe("going back from a lift's page opened from Train", () => {
  /* Home, then Train on that day, then the lift's page, as the app's own
     history holds them: Back goes one step, to Train. */
  const train = "/program?tab=lift&day=1";
  beforeEach(() => {
    // `cameFromInApp`: the router keeps each entry's place on it.
    window.history.replaceState({ idx: 2 }, "");
  });
  afterEach(() => {
    window.history.replaceState(null, "");
  });

  it("goes back one step, to Train, however often Train is tapped", async () => {
    render(
      <MemoryRouter
        initialEntries={["/", train, "/program/lift/1"]}
        initialIndex={2}
      >
        <Routes>
          <Route path="/" element={<Address />} />
          <Route path="/program" element={<Address />} />
          <Route
            path="/program/lift/:day"
            element={
              <>
                <LiftSession />
                <Address />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    );
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
