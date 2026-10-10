// @vitest-environment jsdom — renders the hook; the rest of this directory runs in the node environment.
/**
 * The day moves on while the app is open.
 *
 * On a phone the app is resumed far more often than it is started: it sits
 * in the background overnight and comes back on Monday with the page still
 * loaded. The weekly rollover (`rollLiftWeeks`, `rollRunWeeks`) ran only when
 * the plan or the profile changed, so a resumed app kept last week's plan
 * (its sessions done, its runs on last week's dates) while Home's week strip
 * showed the new week, until something reloaded it. The E2E journeys found
 * it: the clock moved to Monday, the app came back, and the plan stayed put.
 * The race's rest days (Lift4 (10)) waited the same way for a reload.
 *
 * Drives the real hook through the one Firestore fake (ADR-0009), with the
 * date moved and the page's return fired as a phone fires it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

import { generateSchedule } from "@/lib/scheduleUtils";
import { buildPlan } from "../planBuilder";
import { CURRENT_PROGRAM_SCHEMA_VERSION } from "../programTypes";
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
  auth: { currentUser: { uid: "userA" } },
}));

import {
  seedFirestore,
  resetFirestore,
  readDoc,
  readLog,
  deferReads,
  resumeReads,
  pendingReads,
  releaseRead,
  releaseAllReads,
} from "@/test/firestoreHarness";
import { savedRunDoc } from "@/test/sessionFixtures";

let mockProfile: Record<string, unknown> | null = null;
// Stable, as the AuthProvider's are: a new function on each render would
// re-run every effect that depends on one, the rollovers included, and
// hide whether they re-run for the day.
const auth = vi.hoisted(() => ({
  user: { uid: "userA" },
  updateProfile: async () => ({ ok: true }),
  refreshProfile: async () => undefined,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: auth.user,
    profile: mockProfile,
    updateProfile: auth.updateProfile,
    refreshProfile: auth.refreshProfile,
  }),
  useUid: () => "userA",
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

import { sendProgramCommand } from "../programCommandClient";
import { useProgram } from "../useProgram";

const PLAN = "users/userA/programState/current";
const shift = (key: string, days: number) =>
  localDateString(addLocalDays(parseLocalDate(key), days));
/** This real week's Monday, so the dates stay near today's. */
const MONDAY = localWeekKey(new Date());
const TUESDAY = shift(MONDAY, 1);
const NEXT_MONDAY = shift(MONDAY, 7);

function plan() {
  return readDoc(PLAN) as
    | { liftWeekKey?: string; runDays?: { weekKey?: string }[] }
    | undefined;
}

/** The phone brings the app back: hidden, then visible again. */
function resume() {
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
}

/**
 * The app open on Tuesday, done with its load: the server's copy read and
 * migrated, and every effect that runs on it run. Only then does the
 * clock move, so the week can only turn over on the app's return.
 */
async function settledOnTuesday() {
  const { result } = renderHook(() => useProgram());
  await waitFor(() => expect(result.current.readiness).toBe("ready"));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  expect(localDateString(new Date())).toBe(TUESDAY);
}

beforeEach(() => {
  resetFirestore();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TUESDAY}T12:00:00`));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a resumed app brings the plan up to today", () => {
  it("a lifter's plan, on Monday's return", async () => {
    // The plan setup builds on a Tuesday: its lift week is this one.
    const built = buildPlan({
      primaryGoal: "strength",
      nutritionPhase: "recomp",
      experience: "intermediate",
      bodyweightKg: 80,
      sex: "male",
      liftDays: 3,
      preferredSplit: "auto",
      runMode: "freeform",
      weeklyRunDays: 0,
      equipment: "full_gym",
      injuries: [],
      currentDate: TUESDAY,
      preserveHistory: false,
    });
    seedFirestore({
      [PLAN]: built.programState as unknown as Record<string, unknown>,
    });
    // The profile as setup leaves it: the builder's half of the save.
    mockProfile = { uid: "userA", ...built.profileUpdates };
    await settledOnTuesday();
    expect(plan()?.liftWeekKey).toBe(MONDAY);

    // Overnight in the background, then back on Monday morning.
    vi.setSystemTime(new Date(`${NEXT_MONDAY}T08:00:00`));
    resume();
    await waitFor(() => expect(plan()?.liftWeekKey).toBe(NEXT_MONDAY));
  });

  it("a race plan's runs, with the runner's recent running read again for the new day", async () => {
    // Trained right up to the plan: a layoff read today says "none".
    seedFirestore(
      Object.fromEntries(
        Array.from({ length: 8 }, (_, i) => [
          `users/userA/runs/r${i}`,
          savedRunDoc(shift(TUESDAY, -(1 + i * 3)), {
            distance: 8000,
            duration: 2700,
          }),
        ])
      )
    );
    mockProfile = {
      uid: "userA",
      weekSchedule: generateSchedule(2, 4),
      weekScheduleVersion: 1,
      weeklyWorkoutsTarget: 2,
      weeklyRunDaysTarget: 4,
      runMode: "race_prep",
      raceGoal: { distance: "half", targetDate: shift(MONDAY, 12 * 7 + 6) },
      primaryGoal: "hypertrophy",
      program: { goal: "recomp" },
    };
    await settledOnTuesday();
    expect(plan()?.runDays?.[0]?.weekKey).toBe(MONDAY);
    const RUNS = "users/userA/runs";
    const runReads = () =>
      readLog().filter((read) => read.path === RUNS).length;
    const readsBefore = runReads();

    // Back on Monday, with the day's read of their running held in flight
    // and every other read answered: the week waits for it. Built on the
    // read from the day the app opened, a runner away since then would
    // roll into a full week rather than a re-entry one.
    deferReads();
    vi.setSystemTime(new Date(`${NEXT_MONDAY}T08:00:00`));
    resume();
    await waitFor(() => expect(pendingReads()).toContain(RUNS));
    expect(runReads()).toBeGreaterThan(readsBefore);
    for (let i = 0; i < 20; i++)
      await act(async () => {
        const other = pendingReads().findIndex((path) => path !== RUNS);
        if (other >= 0) releaseRead(other);
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    expect(plan()?.runDays?.[0]?.weekKey).toBe(MONDAY);

    resumeReads();
    act(() => releaseAllReads());
    await waitFor(() =>
      expect(plan()?.runDays?.every((run) => run.weekKey === NEXT_MONDAY)).toBe(
        true
      )
    );
  });

  it("race week's rest days, from the day the app comes back two days out", async () => {
    // A Friday race, inside this week, so nothing rolls over: only the day
    // moves. Three days out the session is still there.
    const targetDate = shift(TUESDAY, 3);
    mockProfile = {
      uid: "userA",
      weekSchedule: generateSchedule(6, 2),
      weekScheduleVersion: 1,
      weeklyWorkoutsTarget: 6,
      weeklyRunDaysTarget: 2,
      runMode: "race_prep",
      raceGoal: { distance: "10k", targetDate },
      primaryGoal: "hypertrophy",
      program: { goal: "recomp" },
    };
    seedFirestore({
      [PLAN]: {
        goal: "recomp",
        currentPhase: "deload",
        raceWeek: "race",
        weekNumber: 7,
        splitType: "ppl",
        workouts: [
          { dayName: "Push", dayType: "push", completed: false, exercises: [] },
          {
            dayName: "Pull",
            dayType: "pull",
            completed: false,
            skipped: true,
            exercises: [],
          },
        ],
        fatigueScore: 0,
        updatedAt: Date.now(),
        settings: { autoProgression: true, smallPlates: false },
        weekHistory: [],
        programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
        liftWeekKey: MONDAY,
        runDays: [],
        runPlan: {
          mode: "race_prep",
          raceGoal: { distance: "10k", targetDate },
          currentWeek: 4,
          totalWeeks: 4,
        },
      },
    });
    const skipsSent = () =>
      vi
        .mocked(sendProgramCommand)
        .mock.calls.map(([command]) => command)
        .filter((command) => command.kind === "skipWorkoutDay");
    await settledOnTuesday();
    expect(skipsSent()).toEqual([]);

    // Back on Wednesday, two days before the race.
    vi.setSystemTime(new Date(`${shift(TUESDAY, 1)}T08:00:00`));
    resume();
    await waitFor(() =>
      expect(skipsSent()).toEqual([
        expect.objectContaining({ dayIndex: 0, expectedWeekNumber: 7 }),
      ])
    );
  });
});
