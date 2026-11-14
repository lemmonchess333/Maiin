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
// The post's map image (Soc15 call 5) is drawn with WebGL, which jsdom
// has not got; what is held here is what the run hands it.
vi.mock("@/lib/routeMapUpload", () => ({
  attachRouteMap: vi.fn(async () => {}),
}));

import {
  completeRun,
  earlierRunHistory,
  runDay,
  runDocument,
  runPost,
  runPostPreview,
  runPostRoute,
  type FinishedRun,
} from "../runCompletion";
import type { SavedRun } from "../savedRuns";
import { attachRouteMap } from "../routeMapUpload";
import { pendingDocumentWrites } from "../offlineQueue";
import { runPostName } from "../runName";
import type { RacePaceWork } from "../racePace";
import { freeformPlanMetadata, type RunPlanMetadata } from "../runPlanMetadata";

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
  it("keeps a goal race's predictions on its run, and on no other", () => {
    const racePrediction = {
      v: 1 as const,
      distance: "10k" as const,
      targetDate: localDateString(START),
      entry: "race" as const,
      goalTimeS: null,
      predictions: [],
    };
    expect(runDocument(run({ racePrediction }), FINISH)).toMatchObject({
      racePrediction,
    });
    expect(runDocument(run(), FINISH)).not.toHaveProperty("racePrediction");
    expect(
      runDocument(run({ racePrediction: null }), FINISH)
    ).not.toHaveProperty("racePrediction");
    // A run saved anyway is never the race.
    expect(
      runDocument(run({ racePrediction, isInvalid: true }), FINISH)
    ).not.toHaveProperty("racePrediction");
  });

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

  it("keeps the recording day and end when review is saved later in another time zone", () => {
    const start = Date.UTC(2026, 6, 21, 6, 50);
    const end = start + 35 * 60_000;
    const saved = runDocument(
      run({
        points: [],
        identity: {
          uid: "runner",
          sessionId: "run-origin",
          runId: "run-origin",
          scheduledRunId: null,
          startedAt: start,
          startLocalDate: "2026-07-20",
          originTimeZone: "America/Los_Angeles",
        },
        recordingStartedAt: start + 2 * 60_000,
        finishedAt: end,
      }),
      new Date(Date.UTC(2026, 6, 23, 12))
    );
    expect(saved.date).toBe("2026-07-20");
    expect(saved.startedAt.toMillis()).toBe(start);
    expect(saved.recordingStartedAt?.toMillis()).toBe(start + 2 * 60_000);
    expect(saved.recordingEndedAt?.toMillis()).toBe(end);
    expect(saved.duration).toBe(1830);
    expect(saved.completedAt.toMillis()).toBe(Date.UTC(2026, 6, 23, 12));
    expect(saved.originTimeZone).toBe("America/Los_Angeles");
    expect(saved.sessionId).toBe("run-origin");
  });

  it.each(["clipped", "fully private"])(
    "keeps the original start day when the saved route is %s",
    (route) => {
      const points =
        route === "clipped"
          ? trace(2).map((point, i) => ({
              ...point,
              timestamp: FINISH.getTime() + i * 1000,
            }))
          : [];
      const saved = runDocument(
        run({ points, startedAt: START.getTime() }),
        FINISH
      );
      expect(saved.date).toBe(localDateString(START));
      expect(saved.startedAt.toMillis()).toBe(START.getTime());
      expect(saved.points).toEqual(points);
    }
  );

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

  it("saves a planned run done on the treadmill as the planned run, with the treadmill as where (Pgm8)", () => {
    const planMetadata = {
      planMode: "race_prep" as const,
      planSource: "today_plan" as const,
      plannedRunDayIndex: 3,
      plannedTemplateId: "tempo_30",
      plannedTemplateType: "tempo",
      actualTemplateId: "tempo_30",
      matchedPlanExact: true,
      matchedPlanType: true,
      offPlan: false,
      planWeekIndex: 4,
      planTotalWeeks: 12,
      scheduledRunId: "rd-tempo",
    };
    const runConfig = {
      activityType: "tempo",
      place: "treadmill",
      planMetadata,
    } as FinishedRun["runConfig"];
    expect(runDocument(run({ points: [], runConfig }), FINISH)).toMatchObject({
      activityType: "tempo",
      place: "treadmill",
      matchedPlanType: true,
      offPlan: false,
      scheduledRunId: "rd-tempo",
    });
    // An outdoor run says so, rather than leaving the field out.
    expect(runDocument(run(), FINISH).place).toBeNull();
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
    // 600 points a second apart, thinned to 500: both ends kept, in order,
    // evenly spread. 599 s over 499 gaps is 399 gaps of 1 s and 100 of 2 s.
    const seconds = saved.points.map(
      (p) => (p.timestamp - START.getTime()) / 1000
    );
    expect(seconds).toHaveLength(500);
    expect(seconds[0]).toBe(0);
    expect(seconds.at(-1)).toBe(599);
    const gaps = seconds.slice(1).map((s, i) => s - seconds[i]);
    expect(gaps.filter((g) => g === 1)).toHaveLength(399);
    expect(gaps.filter((g) => g === 2)).toHaveLength(100);
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

  describe("a run's name, from what it was", () => {
    const config = (
      activityType: string,
      plan: Partial<RunPlanMetadata> = {}
    ): FinishedRun["runConfig"] =>
      ({
        activityType,
        planMetadata: { ...freeformPlanMetadata("structured"), ...plan },
      }) as FinishedRun["runConfig"];
    const at = (hour: number, minute = 0) => {
      const d = new Date(START);
      d.setHours(hour, minute, 0, 0);
      return d.getTime();
    };
    const name = (
      runConfig: FinishedRun["runConfig"],
      startedAt = at(7, 30),
      options: Parameters<typeof runPostName>[1] = {}
    ) => runPostName({ runConfig, startedAt, points: [] }, options);

    it("takes the planned session's name", () => {
      expect(name(config("tempo", { actualTemplateId: "tempo_20" }))).toBe(
        "20 Min Tempo"
      );
      expect(
        name(config("easy", { plannedTemplateId: "easy_30", offPlan: false }))
      ).toBe("Easy 30");
    });

    it("names a long run in the runner's unit, and a race-pace finish", () => {
      const long = config("long", { actualTemplateId: "long_8k" });
      expect(name(long, at(7), { unit: "mi" })).toBe("Long 5.0 mi");
      expect(
        name(long, at(7), {
          unit: "km",
          racePace: { kind: "finish" } as RacePaceWork,
        })
      ).toBe("Long 8K with race pace");
    });

    it("leaves the plan's name to a run that was something else", () => {
      // Planned a tempo, ran free: the run is named for itself.
      expect(
        name(
          config("freerun", { plannedTemplateId: "tempo_20", offPlan: true }),
          at(18)
        )
      ).toBe("Evening run");
      // A session launched as one type and changed to another.
      expect(name(config("easy", { actualTemplateId: "tempo_20" }))).toBe(
        "Easy run"
      );
    });

    it("else takes the run type's name", () => {
      expect(name(config("easy"))).toBe("Easy run");
      expect(name(config("long"))).toBe("Long run");
      expect(name(config("intervals"))).toBe("Intervals");
      expect(name(config("guided"))).toBe("Guided run");
    });

    it("else says when in the day it was run", () => {
      expect(name(config("freerun"), at(6, 10))).toBe("Morning run");
      expect(name(config("freerun"), at(11, 59))).toBe("Morning run");
      expect(name(config("freerun"), at(12))).toBe("Afternoon run");
      expect(name(config("freerun"), at(17))).toBe("Evening run");
      expect(name(config("freerun"), at(21))).toBe("Night run");
      expect(name(config("freerun"), at(3, 30))).toBe("Night run");
      expect(name(null, at(14))).toBe("Afternoon run");
      // A run on the treadmill with no session of its own, too.
      expect(name(config("manual"), at(8))).toBe("Morning run");
    });

    it("names a run by when it started, not when it was saved", () => {
      // The fixture starts at 23:50 and is saved after midnight.
      expect(runPostName(run())).toBe("Night run");
    });
  });

  it("saves and posts the runner's own name, else the one it was given", () => {
    const route = { routePreview: [], mapLine: [], note: "" };
    const named = run({ name: "  Bridges loop " });
    expect(runDocument(named, FINISH).name).toBe("Bridges loop");
    expect(runPostPreview(named, route, "km").title).toBe("Bridges loop");
    expect(
      runPost({ uid: "runner" }, named, route, { visibility: "followers" })
    ).toMatchObject({ runName: "Bridges loop", activityTitle: "Bridges loop" });
    // Cleared, it falls back rather than posting an empty title.
    const cleared = run({ name: "   " });
    expect(runDocument(cleared, FINISH).name).toBe("Night run");
    expect(
      runPost({ uid: "runner" }, cleared, route, { visibility: "followers" })
        .runName
    ).toBe("Night run");
  });

  it("previews the distance in the runner's unit", () => {
    // It said kilometres to a runner who reads miles.
    const route = { routePreview: [], mapLine: [], note: "" };
    expect(runPostPreview(run(), route, "mi").meta[0]).toBe("4.10 mi");
    expect(runPostPreview(run(), route, "km").meta[0]).toBe("6.60 km");
  });

  it("previews and posts the same route and figures", () => {
    const route = runPostRoute(trace(600), { withheld: false, showEnds: true });
    expect(runPostPreview(run(), route, "km")).toEqual({
      type: "run",
      title: "Night run",
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
      runName: "Night run",
      activityTitle: "Night run",
      distance: 6600,
      duration: 1830,
      avgPace: 277,
      elevationGain: 12,
      calories: 420,
      routePreview: route.routePreview,
    });
  });
});

describe("moments on a run's post (Soc15)", () => {
  const route = { routePreview: [], mapLine: [], note: "" };
  const saved = (
    id: string,
    distance: number,
    extra: Partial<SavedRun> = {}
  ): SavedRun =>
    ({
      id,
      distance,
      duration: 1800,
      avgPace: 300,
      isInvalid: false,
      savedAnyway: false,
      ...extra,
    }) as SavedRun;

  it("compares the run with the earlier runs that count, less itself", () => {
    const history = earlierRunHistory(
      [
        saved("a", 6000, {
          bestEfforts: [{ distance: 5000, time: 1400 }],
        }),
        saved("b", 5200),
        saved("c", 4100),
        // Neither a run saved despite invalid figures, nor one saved
        // anyway, is a run to beat.
        saved("bad", 9000, { isInvalid: true }),
        saved("anyway", 9500, {
          savedAnyway: true,
          bestEfforts: [{ distance: 5000, time: 900 }],
        }),
        // The run itself, once saved.
        saved("this-run", 6600),
      ],
      "this-run"
    );
    expect(history).toEqual({
      count: 3,
      longestMeters: 6000,
      fastestSeconds: { 5000: 1400 },
    });
    const post = runPost(
      { uid: "runner" },
      run({
        moments: {
          history,
          streak: { before: 13, after: 14 },
          firstSession: false,
        },
      }),
      route,
      { visibility: "public" }
    );
    expect(post.moments).toEqual([
      { kind: "streak", days: 14 },
      { kind: "fastestEffort", meters: 5000, seconds: 1385 },
      { kind: "longestRun", meters: 6600 },
    ]);
  });

  it("writes none for a run with nothing to tell, or saved despite invalid figures", () => {
    const quiet = runPost({ uid: "runner" }, run(), route, {
      visibility: "public",
    });
    expect(quiet).not.toHaveProperty("moments");
    const invalid = runPost(
      { uid: "runner" },
      run({
        isInvalid: true,
        moments: { history: null, firstSession: true },
      }),
      route,
      { visibility: "public" }
    );
    expect(invalid).not.toHaveProperty("moments");
  });

  it("never saves the moments on the run itself, and dates the streak by the run's day", () => {
    const finished = run({ moments: { firstSession: true } });
    const doc = runDocument(finished, FINISH);
    expect(doc).not.toHaveProperty("moments");
    expect(runDay(finished, FINISH)).toBe(doc.date);
    expect(runDay(finished, FINISH)).toBe(localDateString(START));
  });
});

describe("completeRun", () => {
  const route = { routePreview: [], mapLine: [], note: "" };

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

  it("uses the run document ID allocated at Start, even before the first save", () => {
    const identity = {
      uid: "runner",
      sessionId: "start-id",
      runId: "start-id",
      scheduledRunId: null,
      startedAt: START.getTime(),
      startLocalDate: localDateString(START),
      originTimeZone: "UTC",
    };
    const done = completeRun({
      uid: "runner",
      author: {},
      runId: null,
      alreadySaved: false,
      run: run({ identity }),
      route,
      unit: "km",
    });
    expect(done.runId).toBe("start-id");
    expect(pendingDocumentWrites("runner", "users/runner/runs")).toMatchObject([
      { id: "start-id" },
    ]);
    expect(() =>
      completeRun({
        uid: "other",
        author: {},
        runId: null,
        alreadySaved: false,
        run: run({ identity }),
        route,
        unit: "km",
      })
    ).toThrow(/identity/);
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
      expect.objectContaining({ type: "run", title: "Night run" })
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

  it("hands the post its map once it exists online: the route it shared, under its id", async () => {
    vi.mocked(attachRouteMap).mockClear();
    online.mockReturnValue(true);
    const shared = runPostRoute(trace(600), {
      withheld: false,
      showEnds: false,
    });
    const done = completeRun({
      uid: "runner",
      author: {},
      runId: "run-map",
      alreadySaved: false,
      run: run(),
      route: shared,
      unit: "km",
    });
    // Before the post exists there is nothing to put a map on.
    expect(attachRouteMap).not.toHaveBeenCalled();
    const outcome = await done.share!.post({
      visibility: "public",
      caption: "",
    });
    expect(outcome.status).toBe("posted");
    if (outcome.status !== "posted") return;
    // Its code is loaded once the post exists, so the call lands after.
    await vi.waitFor(() =>
      expect(attachRouteMap).toHaveBeenCalledExactlyOnceWith({
        uid: "runner",
        activityId: outcome.activityId,
        route: shared,
      })
    );
  });
});
