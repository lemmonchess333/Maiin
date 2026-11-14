/**
 * The goal race's prediction, recorded where the plan is open (Home and
 * Train) and read on the run summary. Firestore is the one fake (ADR-0009);
 * the days are the clock's, so the unit-future run moves them together.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));

const h = vi.hoisted(() => ({
  auth: {
    user: { uid: "u1" } as { uid: string } | null,
    profile: null as Record<string, unknown> | null,
  },
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => h.auth }));

import {
  __forgetRacePredictionCaptures,
  useRacePredictionCapture,
  useRacePredictionLog,
} from "../useRacePredictionLog";
import {
  readDoc,
  readsAt,
  resetFirestore,
  seedFirestore,
  writeLog,
} from "@/test/firestoreHarness";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
  wholeWeeksBetween,
} from "@/lib/dateHelpers";
import { predictedRaceTimesFromFitness } from "@/lib/runPaces";
import type { ProgramState } from "@/features/program/programTypes";

const LOG = "users/u1/programState/racePrediction";
const inDays = (n: number) => localDateString(addLocalDays(new Date(), n));

const confirmed = {
  benchmark: { distanceM: 5000, timeS: 1500 },
  vdot: null,
  source: "manual",
  updatedAt: "2026-01-01T00:00:00.000Z",
  pendingConfirmation: false,
};

function racePlan(targetDate: string): ProgramState {
  return {
    runPlan: {
      mode: "race_prep",
      totalWeeks: 12,
      currentWeek: 0,
      raceGoal: { distance: "10k", targetDate },
    },
  } as unknown as ProgramState;
}

function profileFor(targetDate: string, runFitness: unknown = confirmed) {
  return {
    runMode: "race_prep",
    raceGoal: { distance: "10k", targetDate },
    runFitness,
  };
}

beforeEach(() => {
  resetFirestore();
  __forgetRacePredictionCaptures();
  h.auth.user = { uid: "u1" };
});
afterEach(() => {
  h.auth.profile = null;
});

describe("useRacePredictionCapture", () => {
  it("records the first prediction once the plan is made", async () => {
    const race = inDays(70);
    h.auth.profile = profileFor(race);
    renderHook(() => useRacePredictionCapture(racePlan(race)));
    await waitFor(() => expect(readDoc(LOG)).toBeDefined());
    expect(readDoc(LOG)).toMatchObject({
      v: 1,
      distance: "10k",
      targetDate: race,
      snapshots: [
        {
          reason: "first",
          predictedS: predictedRaceTimesFromFitness(confirmed)!["10k"],
          daysToRace: 70,
          planWeeks: 12,
        },
      ],
    });
  });

  it("adds the prediction going into race week to the race's log", async () => {
    const race = inDays(4);
    seedFirestore({
      [LOG]: {
        v: 1,
        distance: "10k",
        targetDate: race,
        snapshots: [
          {
            at: new Date(Date.now() - 60 * 86_400_000).toISOString(),
            reason: "first",
            predictedS: 3127,
            vdot: 38.3,
            source: "manual",
            weeksDone: 3,
            planWeeks: 12,
            daysToRace: 64,
          },
        ],
      },
    });
    h.auth.profile = profileFor(race);
    renderHook(() => useRacePredictionCapture(racePlan(race)));
    await waitFor(() =>
      expect((readDoc(LOG)?.snapshots as unknown[] | undefined)?.length).toBe(2)
    );
    expect((readDoc(LOG)!.snapshots as { reason: string }[])[1]).toMatchObject({
      reason: "race-week",
      predictedS: 3127,
      daysToRace: 4,
      // Race week is the plan's twelfth; four days out is in it, or the
      // week before it when race day falls in next calendar week.
      weeksDone:
        11 -
        wholeWeeksBetween(
          localWeekKey(new Date()),
          localWeekKey(parseLocalDate(race))
        ),
    });
  });

  it("reads nothing until there is a confirmed prediction, then records it", async () => {
    const race = inDays(70);
    h.auth.profile = profileFor(race, {
      ...confirmed,
      pendingConfirmation: true,
    });
    const plan = racePlan(race);
    const { rerender } = renderHook(() => useRacePredictionCapture(plan));
    // The runner accepts the paces.
    h.auth.profile = profileFor(race);
    rerender();
    // POSITIVE anchor: the confirmed prediction was recorded.
    await waitFor(() => expect(readDoc(LOG)).toBeDefined());
    // One read of the log, for the confirmed pass only.
    expect(readsAt(LOG)).toHaveLength(1);
  });

  it("reads the log once a day for the same race and benchmark", async () => {
    const race = inDays(70);
    h.auth.profile = profileFor(race);
    const first = renderHook(() => useRacePredictionCapture(racePlan(race)));
    await waitFor(() => expect(readDoc(LOG)).toBeDefined());
    first.unmount();
    const writes = writeLog().length;
    renderHook(() => useRacePredictionCapture(racePlan(race)));
    // Anchor: a second account on the same device is read and recorded.
    h.auth.user = { uid: "u2" };
    renderHook(() => useRacePredictionCapture(racePlan(race)));
    await waitFor(() =>
      expect(readDoc("users/u2/programState/racePrediction")).toBeDefined()
    );
    expect(readsAt(LOG)).toHaveLength(1);
    expect(writeLog().length).toBe(writes + 1);
  });

  it("records nothing on race day", async () => {
    const race = inDays(0);
    h.auth.profile = profileFor(race);
    renderHook(() => useRacePredictionCapture(racePlan(race)));
    // Anchor: the same account's next race, set on the same day, is
    // recorded; race day itself read and wrote nothing.
    const next = inDays(90);
    h.auth.profile = profileFor(next);
    renderHook(() => useRacePredictionCapture(racePlan(next)));
    await waitFor(() => expect(readDoc(LOG)).toBeDefined());
    expect(readDoc(LOG)!.targetDate).toBe(next);
    expect(readsAt(LOG)).toHaveLength(1);
  });
});

describe("useRacePredictionLog", () => {
  it("reads the log only for a goal race, and hands it over once read", async () => {
    const race = inDays(0);
    seedFirestore({
      [LOG]: { v: 1, distance: "10k", targetDate: race, snapshots: [] },
    });
    const { result, rerender } = renderHook(
      ({ enabled }) => useRacePredictionLog("u1", enabled),
      { initialProps: { enabled: false } }
    );
    expect(result.current).toEqual({ log: null, loaded: false });
    expect(readsAt(LOG)).toHaveLength(0);
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.log).toEqual({
      v: 1,
      distance: "10k",
      targetDate: race,
      snapshots: [],
    });
  });

  it("reads no log as loaded with none: a goal race Tropos predicted nothing for", async () => {
    const { result } = renderHook(() => useRacePredictionLog("u1", true));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.log).toBeNull();
  });
});
