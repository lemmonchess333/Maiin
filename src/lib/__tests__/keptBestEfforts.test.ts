// @vitest-environment jsdom
/**
 * A saved run's best efforts, as every reader takes them (`keptBestEfforts`,
 * read by `parseSavedRun` and the run's page).
 *
 * Owner, 23 Nov 2026: Bests read "Best pace 7:50 /km · 16 Aug" over
 * "Fastest 1K 4:29 · 1 Nov", and Recent bests "Best pace 8:51 /km · 1 Nov"
 * beside the same 4:29. The 1 Nov run was 2.85 km at 8:51 /km with
 * kilometres of 9:33 and 11:20. Its finish screen timed that 1K across the
 * GPS catch-up #3036 found the next day: after a gap in the fixes the
 * smoothed position dragged the gap's distance in at up to 90 m/s. #3036
 * stopped a best effort spanning a step faster than any runner
 * (`isImpossibleStep`), but only for runs finished after it; the 1K saved
 * on 1 Nov was still believed by every reader.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));

import { keptBestEfforts, parseSavedRun } from "../savedRuns";
import { runEffortSeconds } from "../runEfforts";
import { runRecordRows } from "../historyFigures";
import { detectBestEfforts, totalDistance, type GPSPoint } from "../gps";
import { sampleRoute, KEPT_ROUTE_POINTS } from "../routeSegments";
import { addLocalDays, localDateString } from "../dateHelpers";

const M_PER_DEG = (6_371_000 * Math.PI) / 180;
const T0 = 1_761_980_000_000;

/**
 * A run's fixes a second apart at 1.6 m/s along a meridian. With
 * `catchUp`, a 7-minute gap at 1,100 s whose distance the position takes
 * in over the twelve fixes after it, 50 m a second: the catch-up the
 * smoothing made before #3036.
 */
function fixes(seconds: number, catchUp: boolean): GPSPoint[] {
  const points: GPSPoint[] = [];
  let metres = 0;
  let at = T0;
  for (let i = 0; i <= seconds; i++) {
    if (i > 0) {
      at += 1000;
      metres += 1.6;
    }
    if (catchUp && i === 1100) at += 420_000;
    if (catchUp && i > 1100 && i <= 1112) metres += (420 * 1.6) / 12;
    const lat = 51.5 + metres / M_PER_DEG;
    points.push({
      lat,
      lon: 0,
      rawLat: lat,
      rawLon: 0,
      altitude: null,
      accuracy: 8,
      speed: null,
      timestamp: at,
    });
  }
  return points;
}

/** The run as `runDocument` saves it: its trace thinned to the points a
 *  run keeps, and the efforts the finish screen timed. */
function savedDoc(
  points: GPSPoint[],
  bestEfforts: { distance: number; time: number; label: string }[],
  daysAgo = 22
) {
  const day = addLocalDays(new Date(), -daysAgo);
  day.setHours(7, 30, 0, 0);
  const distance = totalDistance(points);
  return {
    completedAt: day,
    date: localDateString(day),
    distance,
    duration: 1513,
    avgPace: 531,
    activityType: "freerun",
    points: sampleRoute(points, KEPT_ROUTE_POINTS),
    splits: [
      { km: 1, time: 573, paceSeconds: 573 },
      { km: 2, time: 680, paceSeconds: 680 },
    ],
    bestEfforts,
    isInvalid: false,
  };
}

const SAVED_4_29 = [{ distance: 1000, time: 269, label: "1K" }];

describe("keptBestEfforts", () => {
  it("keeps the efforts a run saved when its trace has no impossible step", () => {
    const doc = savedDoc(fixes(1500, false), SAVED_4_29);
    expect(keptBestEfforts(doc)).toEqual({
      efforts: SAVED_4_29,
      splitsStandIn: true,
    });
    const run = parseSavedRun("clean", doc)!;
    expect(runEffortSeconds(run, 1000)).toBe(269);
  });

  it("does not believe a 1K the finish timed across a catch-up (1 Nov)", () => {
    const doc = savedDoc(fixes(1500, true), SAVED_4_29);
    // POSITIVE anchor: the saved run still reads, distance and all.
    const run = parseSavedRun("nov-1", doc)!;
    expect(run.distance).toBeGreaterThan(2000);
    expect(keptBestEfforts(doc)).toEqual({ efforts: [], splitsStandIn: false });
    expect(run.bestEfforts).toBeUndefined();
    // The kilometres were cut from the same trace, so they do not stand
    // in either: the run times no 1K rather than a false one.
    expect(run.kmSplitSeconds).toEqual([]);
    expect(runEffortSeconds(run, 1000)).toBeNull();
  });

  it("times a whole kept trace again by the finish's rule", () => {
    /* A run that kept every point (under KEPT_ROUTE_POINTS) is the trace
       its finish screen read, so the rule as it is now, which refuses the
       step, times it exactly. 400 points 3 s apart at 1.6 m/s, with one
       300 m jump in 3 s. */
    const points: GPSPoint[] = [];
    let metres = 0;
    for (let i = 0; i < 490; i++) {
      if (i > 0) metres += 4.8 + (i === 245 ? 300 : 0);
      const lat = 51.5 + metres / M_PER_DEG;
      points.push({
        lat,
        lon: 0,
        rawLat: lat,
        rawLon: 0,
        altitude: null,
        accuracy: 8,
        speed: null,
        timestamp: T0 + i * 3000,
      });
    }
    const doc = savedDoc(points, SAVED_4_29);
    expect(doc.points).toHaveLength(490);
    const kept = keptBestEfforts(doc);
    expect(kept).toEqual({
      efforts: detectBestEfforts(points, doc.distance),
      splitsStandIn: false,
    });
    // The runner's own 1.6 m/s: 625 s a kilometre, never the jump's.
    const oneK = kept.efforts.find((e) => e.distance === 1000)?.time;
    expect(oneK).toBeGreaterThanOrEqual(625);
    expect(oneK).toBeLessThan(640);
  });

  it("leaves Bests' fastest 1K to a run that ran it", () => {
    const today = localDateString(new Date());
    const range = {
      todayKey: today,
      recentSinceKey: localDateString(addLocalDays(new Date(), -29)),
      newSinceKey: localDateString(addLocalDays(new Date(), -7)),
    };
    const nov1 = parseSavedRun(
      "nov-1",
      savedDoc(fixes(1500, true), SAVED_4_29)
    )!;
    const aug16 = parseSavedRun(
      "aug-16",
      savedDoc(
        fixes(1500, false),
        [{ distance: 1000, time: 410, label: "1K" }],
        99
      )
    )!;
    const bests = runRecordRows([nov1, aug16], range, "km");
    const fastest = bests.lifetime.find((r) => r.label === "Fastest 1K");
    expect(fastest).toMatchObject({ value: "6:50", runId: "aug-16" });
    expect(bests.lifetime.some((r) => r.value === "4:29")).toBe(false);
    expect(bests.recent30d.some((r) => r.value === "4:29")).toBe(false);
  });
});
