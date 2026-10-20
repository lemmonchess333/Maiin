// @vitest-environment jsdom
/**
 * What every saved-session reader shares: `fetchSaved`, the one-shot read
 * both kinds are built on, and the two questions the live engine asks of
 * this phone's offline queue.
 *
 * `fetchSaved` is driven here through a small source of its own, so the
 * pins are on what the shared read promises any source: one read of the
 * source's query for that account and window, documents it cannot read
 * dropped, a wider query trimmed to the window, and the phone's unsynced
 * sessions laid over the result by the source. The kinds' own rules live
 * in `savedWorkouts.test.ts`. (jsdom: the offline queue lives in
 * localStorage.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collection, orderBy, query } from "firebase/firestore";

vi.mock("firebase/firestore");
vi.mock("../firebase", () => ({ db: {} }));

import { db } from "../firebase";
import {
  fetchSaved,
  hasQueuedCreate,
  hasQueuedWrites,
  type SavedSessionSource,
} from "../savedSessions";
import { queueDurableWrite } from "../offlineQueue";
import {
  failNextFirestore,
  readLog,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";
import { savedRunDoc, savedWorkoutDoc } from "@/test/sessionFixtures";

const UID = "lifter";
const OTHER = "someone-else";
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

interface Session {
  id: string;
  day: string;
}
interface Days {
  since: string;
  until: string;
}

/** Workouts as a source: its query is every workout, newest first, so it
 *  is always wider than a window. */
function workoutSource() {
  const source = {
    collection: "workouts",
    windowKey: (w: Days) => `${w.since}:${w.until}`,
    query: vi.fn((uid: string, _w: Days) =>
      query(collection(db, "users", uid, "workouts"), orderBy("date", "desc"))
    ),
    parseDocs: vi.fn(
      (docs: readonly { id: string; data: () => Record<string, unknown> }[]) =>
        docs.flatMap((d) => {
          const date = d.data().date;
          return typeof date === "string" && DAY_KEY.test(date)
            ? [{ id: d.id, day: date }]
            : [];
        })
    ),
    inWindow: vi.fn(
      (s: Session, w: Days) => s.day >= w.since && s.day <= w.until
    ),
    withQueued: vi.fn(
      (_uid: string | null | undefined, loaded: readonly Session[], _w: Days) => [
        ...loaded,
      ]
    ),
  } satisfies SavedSessionSource<Session, Days>;
  return source;
}

const ids = (sessions: Session[]) => sessions.map((s) => s.id);

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("fetchSaved", () => {
  const WEEK: Days = { since: "2026-06-02", until: "2026-06-08" };

  it("reads the source's query for the account and window, once", async () => {
    seedFirestore({
      [`users/${UID}/workouts/w1`]: savedWorkoutDoc("2026-06-03"),
    });
    const source = workoutSource();

    expect(ids(await fetchSaved(source, UID, WEEK))).toEqual(["w1"]);
    expect(source.query).toHaveBeenCalledTimes(1);
    expect(source.query).toHaveBeenCalledWith(UID, WEEK);
    expect(readLog()).toEqual([
      { op: "getDocs", path: `users/${UID}/workouts` },
    ]);
  });

  it("trims a wider query to the window, keeping the query's order", async () => {
    seedFirestore({
      [`users/${UID}/workouts/before`]: savedWorkoutDoc("2026-06-01"),
      [`users/${UID}/workouts/first`]: savedWorkoutDoc("2026-06-02"),
      [`users/${UID}/workouts/mid`]: savedWorkoutDoc("2026-06-05"),
      [`users/${UID}/workouts/last`]: savedWorkoutDoc("2026-06-08"),
      [`users/${UID}/workouts/after`]: savedWorkoutDoc("2026-06-09"),
    });

    const week = await fetchSaved(workoutSource(), UID, WEEK);

    expect(ids(week)).toEqual(["last", "mid", "first"]);
  });

  it("drops a document the source cannot read as a session", async () => {
    seedFirestore({
      [`users/${UID}/workouts/good`]: savedWorkoutDoc("2026-06-04"),
      // Ordered by `date`, so the query returns it; it names no day.
      [`users/${UID}/workouts/broken`]: savedWorkoutDoc("2026-06-04", {
        date: "later",
      }),
    });
    const source = workoutSource();

    expect(ids(await fetchSaved(source, UID, WEEK))).toEqual(["good"]);
    // The source saw both and chose; nothing was dropped before it.
    const seen = source.parseDocs.mock.calls[0][0].map((d) => d.id);
    expect(seen.sort()).toEqual(["broken", "good"]);
  });

  it("lays this phone's unsynced sessions over the window through the source", async () => {
    seedFirestore({
      [`users/${UID}/workouts/synced`]: savedWorkoutDoc("2026-06-03"),
      [`users/${UID}/workouts/old`]: savedWorkoutDoc("2026-05-20"),
    });
    const source = workoutSource();
    source.withQueued.mockImplementation((_uid, loaded) => [
      { id: "on-this-phone", day: "2026-06-06" },
      ...loaded,
    ]);

    const week = await fetchSaved(source, UID, WEEK);

    // It is given the account, the TRIMMED list and the window…
    expect(source.withQueued).toHaveBeenCalledTimes(1);
    expect(source.withQueued).toHaveBeenCalledWith(
      UID,
      [{ id: "synced", day: "2026-06-03" }],
      WEEK
    );
    // …and what it hands back is the answer.
    expect(ids(week)).toEqual(["on-this-phone", "synced"]);
  });

  it("rejects when the read fails, and lays nothing over it", async () => {
    seedFirestore({
      [`users/${UID}/workouts/w1`]: savedWorkoutDoc("2026-06-03"),
    });
    failNextFirestore("getDocs", {
      path: `users/${UID}/workouts`,
      code: "unavailable",
    });
    const source = workoutSource();

    await expect(fetchSaved(source, UID, WEEK)).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(unfiredFailures()).toHaveLength(0);
    expect(source.withQueued).not.toHaveBeenCalled();
  });
});

describe("hasQueuedCreate / hasQueuedWrites", () => {
  const runs = (uid: string) => `users/${uid}/runs`;

  it("sees a session saved on this phone and not yet synced, of that kind only", () => {
    expect(hasQueuedCreate(UID, "runs")).toBe(false);
    expect(hasQueuedWrites(UID, "runs")).toBe(false);

    queueDurableWrite(UID, runs(UID), "r1", savedRunDoc("2026-06-03"));

    expect(hasQueuedCreate(UID, "runs")).toBe(true);
    expect(hasQueuedWrites(UID, "runs")).toBe(true);
    expect(hasQueuedCreate(UID, "workouts")).toBe(false);
    expect(hasQueuedWrites(UID, "workouts")).toBe(false);
  });

  it("counts an edit to a synced session as a write, not a new session", () => {
    queueDurableWrite(
      UID,
      `users/${UID}/workouts`,
      "w1",
      { notes: "Felt strong" },
      true
    );

    expect(hasQueuedWrites(UID, "workouts")).toBe(true);
    expect(hasQueuedCreate(UID, "workouts")).toBe(false);
  });

  it("does not count another account's queue on a shared phone", () => {
    queueDurableWrite(OTHER, runs(OTHER), "r1", savedRunDoc("2026-06-03"));

    expect(hasQueuedCreate(OTHER, "runs")).toBe(true);
    expect(hasQueuedCreate(UID, "runs")).toBe(false);
    expect(hasQueuedWrites(UID, "runs")).toBe(false);
  });

  it("has nothing queued for no account", () => {
    queueDurableWrite(UID, runs(UID), "r1", savedRunDoc("2026-06-03"));
    expect(hasQueuedCreate(UID, "runs")).toBe(true);

    for (const uid of [null, undefined, ""]) {
      expect(hasQueuedCreate(uid, "runs")).toBe(false);
      expect(hasQueuedWrites(uid, "runs")).toBe(false);
    }
  });
});
