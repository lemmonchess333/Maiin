// @vitest-environment jsdom — renders the hook; the rest of this directory runs in the node environment.
/**
 * The starter goal (Run9's reopening) through the real hook: the loader
 * builds a goal's first week, and the Monday rollover weighs the week left
 * by the runs saved in it and, on the goal's last week, finishes it in the
 * same write as the plan. The pure rules are pinned in `starterPlan.test.ts`
 * and `starterRollover.test.ts`; these pin that the hook reads the runs and
 * writes what those functions answer (ADR-0008).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import {
  addLocalDays,
  localDateString,
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
  writeLog,
  resumeReads,
} from "@/test/firestoreHarness";
import { savedRunDoc } from "@/test/sessionFixtures";

const USER = { uid: "starter1" };
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
import { scheduleStarterWeek } from "../runScheduler";
import { starterRunPlan } from "../starterWeek";
import type { ProgramState } from "../programTypes";

/** A Monday, the clock's day in every test here. */
const TODAY = "2026-10-19";
const LAST_WEEK = "2026-10-12";
const shift = (key: string, n: number) =>
  localDateString(addLocalDays(parseLocalDate(key), n));
const PLAN_PATH = `users/${USER.uid}/programState/current`;

/** Lifts Monday, Wednesday and Friday; runs Tuesday, Thursday, Saturday. */
const SCHEDULE = [
  { day: 0, type: "rest" },
  { day: 1, type: "lift" },
  { day: 2, type: "run" },
  { day: 3, type: "lift" },
  { day: 4, type: "run" },
  { day: 5, type: "lift" },
  { day: 6, type: "run" },
];

function starterProfile() {
  return {
    uid: USER.uid,
    weekSchedule: SCHEDULE,
    weekScheduleVersion: 1,
    weeklyWorkoutsTarget: 3,
    weeklyRunDaysTarget: 3,
    runMode: "starter" as const,
    starterGoal: { startedOn: shift(LAST_WEEK, -56) },
    primaryGoal: "general",
    experience: "beginner",
    program: { goal: "recomp" },
  };
}

function seedRuns(days: string[]): void {
  const tree: Record<string, Record<string, unknown>> = {};
  days.forEach((day, i) => {
    tree[`users/${USER.uid}/runs/r${i}`] = savedRunDoc(day, {
      distance: 3000,
      duration: 1800,
    });
  });
  seedFirestore(tree);
}

const plan = () => readDoc(PLAN_PATH) as ProgramState | undefined;

/** Lets the hook write the goal's first plan, then moves it back a week at
 *  `stage`, as a plan last moved on a week ago is stored. */
async function planLastWeekAt(stage: number): Promise<void> {
  const { unmount } = renderHook(() => useProgram());
  await waitFor(() => expect(plan()?.runPlan?.mode).toBe("starter"));
  unmount();
  seedFirestore({
    [PLAN_PATH]: {
      ...(plan() as object),
      runDays: scheduleStarterWeek({
        weekSchedule: SCHEDULE as never,
        weekStart: LAST_WEEK,
        stage,
      }),
      runPlan: starterRunPlan(stage, LAST_WEEK),
    },
  });
  mockProfile = starterProfile();
}

beforeEach(() => {
  const monday = parseLocalDate(TODAY);
  monday.setHours(12);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(monday);
  resetFirestore();
  resumeReads();
  mockProfile = starterProfile();
  // The stored profile, which a finish is written against.
  seedFirestore({ [`users/${USER.uid}`]: starterProfile() });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the starter goal through useProgram", () => {
  it("builds a goal's first week at the first stage, from today", async () => {
    renderHook(() => useProgram());
    await waitFor(() => expect(plan()?.runPlan?.mode).toBe("starter"));
    expect(plan()?.runPlan).toEqual(starterRunPlan(1, TODAY));
    expect(plan()?.runDays?.map((d) => [d.date, d.templateId])).toEqual([
      [shift(TODAY, 1), "run_walk_1"],
      [shift(TODAY, 3), "run_walk_1"],
      [shift(TODAY, 5), "run_walk_1"],
    ]);
  });

  it("moves the stage on after a week with two runs", async () => {
    await planLastWeekAt(3);
    seedRuns([shift(LAST_WEEK, 1), shift(LAST_WEEK, 3)]);
    renderHook(() => useProgram());
    await waitFor(() => expect(plan()?.runPlan?.stageWeekKey).toBe(TODAY));
    expect(plan()?.runPlan).toEqual(starterRunPlan(4, TODAY));
    expect(plan()?.runDays?.[0]?.templateId).toBe("run_walk_4");
  });

  it("repeats the stage after a week with one run", async () => {
    await planLastWeekAt(3);
    seedRuns([shift(LAST_WEEK, 1)]);
    renderHook(() => useProgram());
    await waitFor(() => expect(plan()?.runPlan?.stageWeekKey).toBe(TODAY));
    expect(plan()?.runPlan?.stage).toBe(3);
  });

  it("finishes the goal on its last week, with the profile, in one write", async () => {
    await planLastWeekAt(9);
    seedRuns([shift(LAST_WEEK, 1), shift(LAST_WEEK, 3), shift(LAST_WEEK, 5)]);
    renderHook(() => useProgram());
    await waitFor(() => expect(plan()?.runPlan).toBeUndefined());
    expect(plan()?.runDays).toEqual([]);
    const profileWrite = writeLog().find(
      (w) =>
        w.path === `users/${USER.uid}` &&
        (w.data as { runMode?: string })?.runMode === "freeform"
    );
    expect(profileWrite?.data).toEqual({
      starterGoal: {
        startedOn: starterProfile().starterGoal.startedOn,
        // The day of the week's second run.
        finishedOn: shift(LAST_WEEK, 3),
      },
      runMode: "freeform",
    });
  });
});
