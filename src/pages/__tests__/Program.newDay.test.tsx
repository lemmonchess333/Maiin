/**
 * Train lands on the session up next when a new day comes round with the
 * page open (TrainWk1 step 6's journey, "a runner adds lifting mid-week").
 *
 * The runner added lifting on a Wednesday and finished its first lift on
 * Train. Done closes the workout onto the day just finished, which shows
 * Completed: what was done, kept in view. The next day the app comes back
 * with Train still open, and Train's selection was moved only on a new
 * week, so Thursday opened on Wednesday's finished lift with no Start, and
 * the tab bar's Train, already the page, changed nothing. A fresh open
 * lands on the session up next; a new day now does the same.
 *
 * The real Train page over a stubbed `useProgram` holding the plan the
 * add-lifting save builds (`sportChange`, `buildPlan`); Firestore is the
 * one fake (ADR-0009) for what the page's other hooks read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LIFT_DAY_STATUS_LABEL } from "@/features/program/liftDayStatus";
import { buildPlan } from "@/features/program/planBuilder";
import type { ProgramState } from "@/features/program/programTypes";
import { sportChange } from "@/lib/sportChange";
import type { UserProfile } from "@/lib/auth";
import { resetFirestore } from "@/test/firestoreHarness";
import { WORKOUT } from "@/test/journeyScreens";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  functions: {},
  storage: {},
  auth: { currentUser: { uid: "u1" } },
}));

const h = vi.hoisted(() => {
  let state: unknown = null;
  const listeners = new Set<() => void>();
  return {
    profile: null as unknown,
    get: () => state,
    set(next: unknown) {
      state = next;
      listeners.forEach((notify) => notify());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  useAuth: () => ({
    user: { uid: "u1" },
    profile: h.profile,
    updateProfile: vi.fn(async () => ({ ok: true })),
    refreshProfile: vi.fn(async () => undefined),
  }),
  useUid: () => "u1",
  useUidForStorageKey: () => "u1",
}));

vi.mock("@/features/program/useProgram", async () => {
  const { useSyncExternalStore } = await import("react");
  const { generateWeekPrescription: prescriptionFor } =
    await import("@/features/program/weekPrescription");
  return {
    useProgram: () => {
      const programState = useSyncExternalStore(h.subscribe, h.get) as {
        weekNumber: number;
      } | null;
      const action = vi.fn(async () => true);
      return {
        programState,
        prescription: programState
          ? prescriptionFor(programState.weekNumber)
          : null,
        loading: false,
        readiness: "ready",
        recentLayoff: "none",
        recentRuns: null,
        viewingHistoryIndex: null,
        viewedWorkouts: undefined,
        viewedWeekNumber: null,
        viewWeek: vi.fn(),
        completeWorkoutDay: action,
        skipWorkoutDay: action,
        setNextWorkout: action,
        advanceToNextWeek: action,
        regenerateProgram: action,
        reorderDayExercises: action,
        removeExerciseFromDay: action,
        addExercisesToDayCmd: action,
        replaceExerciseInDay: action,
        restoreRemovedExercise: action,
        overrideRunDay: action,
        applyEaseWeek: action,
        revertEaseWeek: action,
        markManualComplete: action,
        skipRunDay: action,
        restoreRunDay: action,
        restoreWorkoutDay: action,
        moveRunDay: action,
        refreshRunSchedule: action,
        skipRecoveryEarly: action,
        realignRacePlan: action,
        dismissFellBehindPrompt: action,
        applyDeloadWeek: action,
        revertDeloadWeek: action,
        startTrainingBlock: action,
        adoptLegacyTrainingBlock: action,
        releaseTrainingBlock: action,
        keepTrainingBlockFocus: action,
      };
    },
  };
});

// The workout screen is not under test here: Start only has to be there.
vi.mock("@/components/WorkoutSession", () => ({ default: () => null }));

import Program from "../Program";
import ProgramEngineRoute from "@/features/program/ProgramEngineRoute";

/** The journey's days: a Wednesday, and the Thursday after it. */
const WEDNESDAY = "2026-11-25";
const THURSDAY = "2026-11-26";
const noonOf = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};

/** A runner new to running, set up today, who then adds three lift days,
 *  as the journey's runner does: the plan and the profile the save leaves. */
function runnerWithLifting(): { profile: UserProfile; plan: ProgramState } {
  const setup = buildPlan({
    primaryGoal: "running",
    nutritionPhase: "recomp",
    experience: "beginner",
    liftDays: 0,
    preferredSplit: "full_body",
    runMode: "starter",
    weeklyRunDays: 3,
    equipment: "full_gym",
    injuries: [],
    currentDate: WEDNESDAY,
    preserveHistory: false,
  });
  const runner = {
    uid: "u1",
    athleteType: "Runner",
    weightKg: 70,
    sex: "female",
    runFrequency: "new",
    starterGoal: { startedOn: WEDNESDAY },
    ...setup.profileUpdates,
  } as unknown as UserProfile;
  const change = sportChange(
    {
      profile: runner,
      programState: setup.programState,
      today: WEDNESDAY,
      recentLayoff: "none",
      recentRuns: [],
    },
    {
      kind: "add_lifting",
      answers: {
        liftDays: 3,
        sessionMinutes: 60,
        equipment: "full_gym",
        barbellAtHome: false,
        pullUpBar: true,
        smallPlates: false,
        experience: "intermediate",
        injuries: ["none"],
      },
    }
  );
  if (!change.ok) throw new Error(change.sentence);
  const added = buildPlan(change.input);
  return {
    profile: JSON.parse(
      JSON.stringify({ ...runner, ...added.profileUpdates, ...change.patch })
    ) as UserProfile,
    plan: JSON.parse(JSON.stringify(added.programState)) as ProgramState,
  };
}

function renderTrain() {
  return render(
    <MemoryRouter initialEntries={["/program"]}>
      <Routes>
        {/* As App.tsx nests it: Train reads the engine from the route. */}
        <Route path="/program" element={<ProgramEngineRoute />}>
          <Route index element={<Program />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

const start = () => screen.queryByRole("button", { name: WORKOUT.start });
/** The day card's state word ("Up next", "Completed"), in its eyebrow. */
const dayCardSays = (state: "today" | "completed") =>
  screen.getByText(new RegExp(LIFT_DAY_STATUS_LABEL[state]));

beforeEach(() => {
  resetFirestore();
  sessionStorage.clear();
  // Train scrolls to the top when the day shown changes; jsdom has no
  // scrolling.
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(noonOf(WEDNESDAY));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Train on a new day", () => {
  it("lands on the session up next once the day after a finished lift comes round", async () => {
    const { profile, plan } = runnerWithLifting();
    expect(plan.workouts).toHaveLength(3);
    h.profile = profile;
    h.set(plan);
    renderTrain();

    // Wednesday: the week's first lift is up next, on the Lift tab.
    await screen.findByRole("button", { name: WORKOUT.start });
    expect(dayCardSays("today")).toBeInTheDocument();

    // Its session saved: Done comes back to the day just finished.
    act(() => {
      h.set({
        ...plan,
        workouts: plan.workouts.map((day, i) =>
          i === 0 ? { ...day, completed: true } : day
        ),
      });
    });
    expect(start()).toBeNull();
    expect(dayCardSays("completed")).toBeInTheDocument();

    // Thursday, with Train still open: the app comes back on the new day
    // and Train shows the next lift, ready to start.
    act(() => {
      vi.setSystemTime(noonOf(THURSDAY));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(start()).not.toBeNull();
    expect(dayCardSays("today")).toBeInTheDocument();
  });

  it("keeps the finished lift in view for the rest of its day", async () => {
    const { profile, plan } = runnerWithLifting();
    h.profile = profile;
    h.set(plan);
    renderTrain();
    await screen.findByRole("button", { name: WORKOUT.start });
    act(() => {
      h.set({
        ...plan,
        workouts: plan.workouts.map((day, i) =>
          i === 0 ? { ...day, completed: true } : day
        ),
      });
    });
    // The app back the same day: nothing moves.
    act(() => {
      vi.setSystemTime(new Date(noonOf(WEDNESDAY).getTime() + 3_600_000));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(start()).toBeNull();
    expect(dayCardSays("completed")).toBeInTheDocument();
  });
});
