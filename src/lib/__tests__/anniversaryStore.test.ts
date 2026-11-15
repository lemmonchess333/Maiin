// @vitest-environment jsdom
/**
 * Where the account keeps its anniversaries, through the one Firestore
 * fake (ADR-0009): the 50th session shown once, whichever finish reopens
 * it, an account already past every line told nothing, and offline
 * decided nothing. (jsdom: the saved-session readers read the offline
 * queue from localStorage.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "u1" } },
}));

import { anniversariesAfter, markAnniversaryShown } from "../anniversaryStore";
import type { FinishedSession } from "../anniversaries";
import {
  readDoc,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";
import { savedRunDoc, savedWorkoutDoc } from "@/test/sessionFixtures";

const MARKS = "users/u1/stats/anniversaries";

/** `n` saved workouts, one a day back from 1 November 2026, ids w0… */
function workouts(
  n: number,
  from = 0
): Record<string, Record<string, unknown>> {
  const docs: Record<string, Record<string, unknown>> = {};
  for (let i = from; i < from + n; i++) {
    const day = new Date(2026, 10, 1);
    day.setDate(day.getDate() - i);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    docs[`users/u1/workouts/w${i}`] = savedWorkoutDoc(key);
  }
  return docs;
}

const fiftieth: FinishedSession = {
  id: "fiftieth",
  sport: "lift",
  day: "2026-11-14",
  counts: true,
  metres: 0,
};

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("anniversariesAfter", () => {
  it("shows the 50th session once, and records it on the account", async () => {
    seedFirestore({
      ...workouts(49),
      "users/u1/workouts/fiftieth": savedWorkoutDoc("2026-11-14"),
    });

    const due = await anniversariesAfter("u1", fiftieth, { startDay: null });
    expect(due).toEqual([
      { kind: "sessions50", day: "2026-11-14", since: expect.any(String) },
    ]);
    expect(readDoc(MARKS)).toMatchObject({
      sessions50: { day: "2026-11-14", shown: false },
    });

    await markAnniversaryShown("u1", "sessions50", "2026-11-14");
    expect(readDoc(MARKS)).toMatchObject({
      sessions50: { day: "2026-11-14", shown: true },
    });

    // The same finish reopened, or the next one: nothing again.
    expect(
      await anniversariesAfter("u1", fiftieth, { startDay: null })
    ).toEqual([]);
  });

  it("shows one earned but never drawn at the next finish", async () => {
    seedFirestore({
      [MARKS]: { sessions50: { day: "2026-11-10", shown: false } },
      ...workouts(60),
    });
    expect(
      await anniversariesAfter(
        "u1",
        { ...fiftieth, id: "w0" },
        { startDay: null }
      )
    ).toEqual([
      // Since the first of the 60 sessions the history holds.
      { kind: "sessions50", day: "2026-11-10", since: "2026-09-03" },
    ]);
  });

  it("tells an account already past every line nothing, and records them passed", async () => {
    seedFirestore({
      ...workouts(120),
      "users/u1/runs/far": savedRunDoc("2026-01-10", { distance: 1_200_000 }),
    });
    const due = await anniversariesAfter(
      "u1",
      {
        id: "new-run",
        sport: "run",
        day: "2026-11-14",
        counts: true,
        metres: 5000,
      },
      { startDay: "2025-10-01" }
    );
    expect(due).toEqual([]);
    expect(readDoc(MARKS)).toEqual({
      sessions50: { day: null, shown: true },
      sessions100: { day: null, shown: true },
      oneYear: { day: null, shown: true },
      km1000: { day: null, shown: true },
    });
  });

  it("reads one document once every kind is marked", async () => {
    seedFirestore({
      [MARKS]: {
        sessions50: { day: null, shown: true },
        sessions100: { day: null, shown: true },
        oneYear: { day: null, shown: true },
        km1000: { day: null, shown: true },
      },
      ...workouts(10),
    });
    expect(
      await anniversariesAfter("u1", fiftieth, { startDay: "2025-01-01" })
    ).toEqual([]);
  });

  it("the run that takes the total past 1,000 km earns it, counted from the runs held", async () => {
    seedFirestore({ "users/u1/workouts/w": savedWorkoutDoc("2026-01-02") });
    const held = [
      {
        id: "long-ago",
        day: "2026-01-05",
        distance: 997_000,
        duration: 300_000,
        avgPace: 300,
        activityType: "easy",
        completedAt: new Date(2026, 0, 5),
      },
    ];
    const due = await anniversariesAfter(
      "u1",
      {
        id: "this-run",
        sport: "run",
        day: "2026-11-14",
        counts: true,
        metres: 5000,
      },
      // The run finish holds every saved run already.
      { startDay: null, runs: held as never }
    );
    expect(due).toEqual([
      { kind: "km1000", day: "2026-11-14", since: "2026-01-05" },
    ]);
  });

  it("decides nothing offline, and records nothing", async () => {
    seedFirestore({ ...workouts(49) });
    // Anchor: online, the same finish earns it.
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    expect(
      await anniversariesAfter("u1", fiftieth, { startDay: null })
    ).toEqual([]);
    expect(readDoc(MARKS)).toBeUndefined();
    vi.restoreAllMocks();
    expect(
      (await anniversariesAfter("u1", fiftieth, { startDay: null })).map(
        (d) => d.kind
      )
    ).toEqual(["sessions50"]);
  });
});
