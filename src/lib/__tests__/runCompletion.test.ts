// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readDoc, resetFirestore } from "@/test/firestoreHarness";
import type { GPSPoint } from "@/lib/gps";
import { localDateString } from "@/lib/dateHelpers";

/**
 * Finishing a run, without the page: the saved run, the save (resumed by
 * id after a failure) and the post. Driven through the one Firestore fake
 * (ADR-0009) and the real offline queue.
 */
vi.mock("firebase/firestore");
const h = vi.hoisted(() => ({
  user: { uid: "runner" } as { uid: string } | null,
  compose: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: {
    get currentUser() {
      return h.user;
    },
  },
}));
vi.mock("@/lib/shareComposer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shareComposer")>()),
  compose: h.compose,
}));

import {
  completeRun,
  runDocument,
  runPost,
  runPostName,
  runPostPreview,
  runPostRoute,
  type FinishedRun,
} from "../runCompletion";
import { pendingDocumentWrites } from "../offlineQueue";
import { sampleRoute } from "../routeSegments";

/* Started at 23:50 the night before last, finished after midnight. */
const START = new Date(Date.now() - 2 * 86_400_000);
START.setHours(23, 50, 0, 0);
const FINISH = new Date(START.getTime() + 30 * 60_000);

/** A straight trace north, about 11 m a point, a point a second. */
const trace = (count: number): GPSPoint[] =>
  Array.from(
    { length: count },
    (_, i) =>
      ({
        lat: 51.5 + i * 0.0001,
        lon: -0.12,
        timestamp: START.getTime() + i * 1000,
      }) as GPSPoint
  );

const run = (extra: Partial<FinishedRun> = {}): FinishedRun => ({
  points: trace(600),
  distance: 6600,
  elapsed: 1830,
  avgPaceSeconds: 277,
  avgPace: "4:37",
  calories: 420,
  elevationGain: 12,
  splits: [],
  runConfig: null,
  notes: "  Windy on the bridge ",
  relativeEffort: "matched",
  paceVerdictTone: null,
  isInvalid: false,
  invalidReason: null,
  routeQuality: null,
  shoeId: "shoe-1",
  bestEfforts: [{ distance: 5000, time: 1385, label: "5K" }],
  ...extra,
});

let online: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  h.user = { uid: "runner" };
  h.compose.mockReset().mockResolvedValue(null);
  online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
});
afterEach(() => online.mockRestore());

describe("runDocument", () => {
  it("files the run under the day it started, not the day it was saved", () => {
    const saved = runDocument(run(), FINISH);
    expect(saved.date).toBe(localDateString(START));
    expect(saved.startedAt.toMillis()).toBe(START.getTime());
    expect(saved.completedAt.toMillis()).toBe(FINISH.getTime());
  });

  it("dates a run with no trace by when it was saved", () => {
    const saved = runDocument(run({ points: [] }), FINISH);
    expect(saved.date).toBe(localDateString(FINISH));
  });

  it("keeps a run saved anyway apart from the runs that count", () => {
    expect(
      runDocument(run({ isInvalid: true, invalidReason: "too-fast" }), FINISH)
    ).toMatchObject({
      isInvalid: true,
      invalidReason: "too-fast",
      savedAnyway: true,
    });
    expect(runDocument(run(), FINISH)).toMatchObject({
      isInvalid: false,
      invalidReason: null,
      savedAnyway: false,
    });
  });

  it("saves a run with no plan behind it as freeform", () => {
    expect(runDocument(run(), FINISH)).toMatchObject({
      activityType: "freerun",
      planMode: "freeform",
      offPlan: false,
      scheduledRunId: null,
    });
  });

  it("keeps the finish screen's best efforts, which the thinned trace cannot find again", () => {
    expect(runDocument(run(), FINISH).bestEfforts).toEqual([
      { distance: 5000, time: 1385, label: "5K" },
    ]);
    // A run saved despite invalid figures names none, as its finish
    // screen named none.
    expect(
      runDocument(run({ isInvalid: true, invalidReason: "too-fast" }), FINISH)
        .bestEfforts
    ).toEqual([]);
  });

  it("keeps what the session's work segments covered, and null for a run with none", () => {
    // A tempo is judged by its blocks (`plannedRunVerdict`); the run keeps
    // the figures it was judged on.
    expect(
      runDocument(run({ workPortion: { seconds: 1200, meters: 4000 } }))
        .workPortion
    ).toEqual({ seconds: 1200, meters: 4000 });
    expect(runDocument(run()).workPortion).toBeNull();
  });

  it("thins the trace, trims the notes and names the shoe", () => {
    const saved = runDocument(run(), FINISH);
    expect(saved.points).toEqual(sampleRoute(trace(600), 500));
    expect(saved.points.length).toBeLessThanOrEqual(500);
    expect(saved.notes).toBe("Windy on the bridge");
    expect(saved.shoeId).toBe("shoe-1");
    expect(saved).toMatchObject({
      distance: 6600,
      duration: 1830,
      avgPace: 277,
      relativeEffort: "matched",
      type: "run",
      visibility: "followers",
    });
  });
});

describe("the run's post", () => {
  it("carries no route while the privacy settings are unread", () => {
    const route = runPostRoute(trace(600), {
      withheld: true,
      showEnds: false,
    });
    expect(route.routePreview).toEqual([]);
    expect(route.note).toMatch(/withheld/);
  });

  it("clips the route's ends unless the runner chose to show them", () => {
    const full = runPostRoute(trace(600), { withheld: false, showEnds: true });
    const clipped = runPostRoute(trace(600), {
      withheld: false,
      showEnds: false,
    });
    expect(full.routePreview[0]).toEqual({ lat: 51.5, lon: -0.12 });
    expect(clipped.routePreview[0].lat).toBeGreaterThan(51.5);
  });

  it("is named for the kind of run", () => {
    expect(runPostName({ runConfig: null })).toBe("Run");
    expect(
      runPostName({
        runConfig: { activityType: "intervals" } as FinishedRun["runConfig"],
      })
    ).toBe("Interval Run");
    expect(
      runPostName({
        runConfig: { activityType: "guided" } as FinishedRun["runConfig"],
      })
    ).toBe("Guided Run");
  });

  it("previews the distance in the runner's unit", () => {
    // It said kilometres to a runner who reads miles.
    const route = { routePreview: [], note: "" };
    expect(runPostPreview(run(), route, "mi").meta[0]).toBe("4.10 mi");
    expect(runPostPreview(run(), route, "km").meta[0]).toBe("6.60 km");
  });

  it("previews and posts the same route and figures", () => {
    const route = runPostRoute(trace(600), { withheld: false, showEnds: true });
    expect(runPostPreview(run(), route, "km")).toEqual({
      type: "run",
      title: "Run",
      routePreview: route.routePreview,
      routePrivacyNote: route.note,
      meta: ["6.60 km", "30:30", expect.stringMatching(/^420 /)],
    });
    expect(
      runPost({ uid: "runner", displayName: "Sam" }, run(), route, {
        visibility: "followers",
        caption: " Out and back ",
      })
    ).toEqual({
      authorId: "runner",
      authorName: "Sam",
      type: "run",
      visibility: "followers",
      caption: "Out and back",
      runName: "Run",
      activityTitle: "Run",
      distance: 6600,
      duration: 1830,
      avgPace: "4:37",
      elevationGain: 12,
      calories: 420,
      routePreview: route.routePreview,
    });
  });
});

describe("completeRun", () => {
  const route = { routePreview: [], note: "" };

  it("queues the run under a new id before any server write", () => {
    const done = completeRun({
      uid: "runner",
      author: {},
      runId: null,
      alreadySaved: false,
      run: run(),
      route,
      unit: "km",
      now: FINISH,
    });
    expect(done.resumed).toBe(false);
    const queued = pendingDocumentWrites("runner", "users/runner/runs");
    expect(queued).toHaveLength(1);
    expect(queued[0].id).toBe(done.runId);
    expect(queued[0].data).toMatchObject({ distance: 6600 });
  });

  it("writes the run once it is online", async () => {
    online.mockReturnValue(true);
    const done = completeRun({
      uid: "runner",
      author: {},
      runId: "run-7",
      alreadySaved: false,
      run: run(),
      route,
      unit: "km",
      now: FINISH,
    });
    await vi.waitFor(() =>
      expect(readDoc("users/runner/runs/run-7")).toMatchObject({
        distance: 6600,
        date: localDateString(START),
      })
    );
    expect(done.runId).toBe("run-7");
  });

  it("writes nothing again for a save resumed after a later step failed", () => {
    const first = completeRun({
      uid: "runner",
      author: {},
      runId: null,
      alreadySaved: false,
      run: run(),
      route,
      unit: "km",
    });
    const again = completeRun({
      uid: "runner",
      author: {},
      runId: first.runId,
      alreadySaved: true,
      run: run(),
      route,
      unit: "km",
    });
    expect(again).toMatchObject({ runId: first.runId, resumed: true });
    expect(pendingDocumentWrites("runner", "users/runner/runs")).toHaveLength(
      1
    );
  });

  it("offers a post of the run under its id, and none for a run saved anyway", async () => {
    const done = completeRun({
      uid: "runner",
      author: {},
      runId: "run-8",
      alreadySaved: false,
      run: run(),
      route,
      unit: "km",
    });
    expect(done.share?.source).toEqual({ kind: "run", id: "run-8" });
    await done.share!.post();
    expect(h.compose).toHaveBeenCalledWith(
      "runner",
      expect.objectContaining({ type: "run", title: "Run" })
    );
    expect(
      completeRun({
        uid: "runner",
        author: {},
        runId: "run-9",
        alreadySaved: false,
        run: run({ isInvalid: true, invalidReason: "too-short" }),
        route,
        unit: "km",
      }).share
    ).toBeUndefined();
  });
});
