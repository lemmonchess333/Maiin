// @vitest-environment jsdom — renders the hook; the rest of this directory runs in the node environment.
/**
 * With a race plan the lighter week falls on the run plan's step-back week
 * (Lift4 (9)), through the real rollover: the run side's next week is worked
 * out first, and the lift side reads where it lands. `raceLighterWeeks.test.ts`
 * pins the rule; this pins that the hook hands the rule the week rolled INTO,
 * not the week left, which a rollover computing the two sides the other way
 * round would get wrong by one week every time.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { generateSchedule } from "@/lib/scheduleUtils";
import {
  localDateString,
  localWeekKey,
  addLocalDays,
  parseLocalDate,
} from "@/lib/dateHelpers";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  functions: {},
  auth: {
    get currentUser() {
      return USER;
    },
  },
}));

import {
  seedFirestore,
  resetFirestore,
  readDoc,
  resumeReads,
} from "@/test/firestoreHarness";
import { savedRunDoc } from "@/test/sessionFixtures";

const USER = { uid: "userA" };
let mockProfile: Record<string, unknown> | null = null;

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: USER,
    profile: mockProfile,
    updateProfile: vi.fn(async () => ({ ok: true })),
    refreshProfile: vi.fn(async () => undefined),
  }),
  useUid: () => USER.uid,
}));

vi.mock("../programCommandClient", () => ({
  sendProgramCommand: vi.fn(async () => undefined),
}));
vi.mock("@/lib/socialApi", () => ({ postActivity: vi.fn() }));
vi.mock("@/lib/shareComposer", () => ({
  compose: vi.fn(),
  enqueueShare: vi.fn(),
  showQueuedToast: vi.fn(),
}));
vi.mock("@/lib/workoutBurn", () => ({ estimateLiftBurn: vi.fn(() => 0) }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { useProgram } from "../useProgram";
import { isRunStepBackWeek } from "../runPlanTiming";

const TODAY = localDateString(new Date());
const shift = (key: string, n: number) =>
  localDateString(addLocalDays(parseLocalDate(key), n));
/** Far enough out that a 16-week marathon block is still in its build. */
const RACE_DATE = shift(TODAY, 9 * 7);
const BLOCK_WEEKS = 16;
const PATH = `users/${USER.uid}/programState/current`;

function profile() {
  return {
    uid: USER.uid,
    // Three lift days and an intermediate's level: a plan the calendar
    // gives lighter weeks.
    weekSchedule: generateSchedule(3, 4),
    weekScheduleVersion: 1,
    weeklyWorkoutsTarget: 3,
    weeklyRunDaysTarget: 4,
    experience: "intermediate",
    runMode: "race_prep" as const,
    raceGoal: { distance: "marathon" as const, targetDate: RACE_DATE },
    primaryGoal: "running",
    program: { goal: "recomp" },
  };
}

type Stored = {
  weekNumber: number;
  currentPhase?: string;
  workouts: { completed?: boolean }[];
  runDays: { weekKey: string }[];
  runPlan?: { currentWeek?: number; totalWeeks?: number };
};

/** Last week, trained, at `liftWeek` of the lifting and `raceWeek` of the
 *  race block: the rollover moves both on by one. */
async function lastWeekAt(liftWeek: number, raceWeek: number) {
  const { rerender } = renderHook(() => useProgram());
  await waitFor(() =>
    expect(
      (readDoc(PATH) as Stored | undefined)?.runDays?.length
    ).toBeGreaterThan(0)
  );
  const doc = readDoc(PATH) as Stored;
  const stale = shift(String(localWeekKey()), -7);
  seedFirestore({
    [PATH]: {
      ...doc,
      weekNumber: liftWeek,
      currentPhase: "progression",
      liftWeekKey: stale,
      workouts: doc.workouts.map((d) => ({ ...d, completed: true })),
      runDays: doc.runDays.map((d) => ({ ...d, weekKey: stale })),
      runPlan: {
        ...doc.runPlan,
        currentWeek: raceWeek,
        totalWeeks: BLOCK_WEEKS,
      },
    },
  });
  mockProfile = profile();
  rerender();
  await waitFor(() =>
    expect((readDoc(PATH) as Stored).runPlan?.currentWeek).toBe(raceWeek + 1)
  );
  return readDoc(PATH) as Stored;
}

beforeEach(() => {
  resetFirestore();
  resumeReads();
  mockProfile = profile();
  for (let i = 0; i < 6; i++) {
    seedFirestore({
      [`users/${USER.uid}/runs/r${i}`]: savedRunDoc(
        shift(TODAY, -(1 + i * 3)),
        {
          distance: 9000,
          duration: 3000,
        }
      ),
    });
  }
});

describe("the rollover puts a race plan's lighter week on its step-back week", () => {
  it("rolls into the run plan's step-back week as a lighter one", async () => {
    // Race week 7 of a 16-week marathon block steps back; lifting week 6
    // would be a full week on the cycle.
    expect(isRunStepBackWeek(7, BLOCK_WEEKS, "marathon")).toBe(true);
    const after = await lastWeekAt(5, 6);
    expect(after.weekNumber).toBe(6);
    expect(after.currentPhase).toBe("deload");
  });

  it("leaves the cycle's lighter week full when the run plan builds through it", async () => {
    // Lifting week 8 is the cycle's lighter week; race week 6 builds.
    expect(isRunStepBackWeek(6, BLOCK_WEEKS, "marathon")).toBe(false);
    const after = await lastWeekAt(7, 5);
    expect(after.weekNumber).toBe(8);
    expect(after.currentPhase).toBe("progression");
  });
});
