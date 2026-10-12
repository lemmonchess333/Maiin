/**
 * The route's pace colours are measured over the 200 m around each
 * stretch, not over the few metres between two fixes. Measured per
 * stretch, GPS wobble alone moved the colour: a perfectly steady run,
 * through the app's own filter, changed colour 26 to 210 times a
 * kilometre at 1 to 3 m of GPS error.
 */
import { describe, expect, it } from "vitest";
import {
  KalmanFilter,
  segmentMetres,
  totalDistance,
  type GPSPoint,
} from "@/lib/gps";
import { THEME } from "@/lib/theme";
import { routePaceColor, routePaceRatios } from "../routePace";

const START = 1_700_000_000_000;
const LAT = 51.5;
/** Metres per degree of longitude at LAT, on the sphere haversine uses. */
const M_LON = 6_371_000 * (Math.PI / 180) * Math.cos((LAT * Math.PI) / 180);

/** A fix taken `seconds` into the run, `east` metres along a straight
 *  road, with the time held before it. */
function fix(seconds: number, east: number, pausedMs = 0): GPSPoint {
  const lon = -0.12 + east / M_LON;
  return {
    lat: LAT,
    lon,
    rawLat: LAT,
    rawLon: lon,
    altitude: null,
    accuracy: 5,
    speed: null,
    timestamp: START + seconds * 1000 + pausedMs,
    ...(pausedMs > 0 ? { pausedMs } : {}),
  };
}

/** One fix a second along the road, at the given pace for each stretch:
 *  `[metres, seconds per km]` pairs. */
function road(legs: [number, number][]): GPSPoint[] {
  const points: GPSPoint[] = [fix(0, 0)];
  let east = 0;
  let seconds = 0;
  for (const [metres, pace] of legs) {
    const end = east + metres;
    while (east < end - 1e-9) {
      east = Math.min(end, east + 1000 / pace);
      seconds += 1;
      points.push(fix(seconds, east));
    }
  }
  return points;
}

/** The run's average pace, as the finish screen works it out: the moving
 *  time over the distance the trace adds up to. */
function averagePace(points: GPSPoint[]): number {
  const seconds =
    (points[points.length - 1].timestamp - points[0].timestamp) / 1000;
  return (seconds / totalDistance(points)) * 1000;
}

const middle = THEME.warning;

describe("routePaceRatios", () => {
  it("keeps a steady run one colour through ordinary GPS wobble", () => {
    // 30 minutes at an even 5:00 /km, with 3 m of GPS error that wanders
    // the way a phone's does, through the filter the app uses.
    let seed = 7;
    const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const gauss = () =>
      Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
    const filter = new KalmanFilter();
    let errNorth = 0;
    let errEast = 0;
    const points = road([[6000, 300]]).map((p) => {
      errNorth = 0.9 * errNorth + Math.sqrt(1 - 0.81) * 3 * gauss();
      errEast = 0.9 * errEast + Math.sqrt(1 - 0.81) * 3 * gauss();
      const east = (p.lon + 0.12) * M_LON + errEast;
      const kept = filter.process(
        LAT + errNorth / 111_195,
        -0.12 + east / M_LON,
        5
      );
      return { ...p, ...kept };
    });
    const average = averagePace(points);

    // Anchor: stretch by stretch, the wobble alone leaves the middle colour
    // hundreds of times.
    let offColour = 0;
    for (let i = 1; i < points.length; i++) {
      const seconds = (points[i].timestamp - points[i - 1].timestamp) / 1000;
      const pace = (seconds / segmentMetres(points[i - 1], points[i])) * 1000;
      if (routePaceColor(pace / average) !== middle) offColour++;
    }
    expect(offColour).toBeGreaterThan(200);

    // Over 200 m, every stretch is the run's own steady pace.
    const colours = routePaceRatios(points, average)
      .filter((ratio): ratio is number => ratio !== null)
      .map(routePaceColor);
    expect(colours).toHaveLength(points.length - 1);
    expect(new Set(colours)).toEqual(new Set([middle]));
  });

  it("still shows a surge, and the steady running either side of it", () => {
    const points = road([
      [1000, 300],
      [400, 240],
      [1000, 300],
    ]);
    const ratios = routePaceRatios(points, averagePace(points));
    const colourAt = (metres: number) => {
      const i = points.findIndex((p) => (p.lon + 0.12) * M_LON >= metres);
      return routePaceColor(ratios[i] as number);
    };
    expect(colourAt(1200)).toBe(THEME.paceFast);
    expect(colourAt(300)).toBe(middle);
    expect(colourAt(2100)).toBe(middle);
  });

  it("gives the line across a pause no pace, and times the running after it", () => {
    const held = 5 * 60_000;
    const before = road([[500, 300]]);
    const last = before[before.length - 1];
    const after = road([[500, 300]])
      .slice(1)
      .map((p) =>
        fix(
          (p.timestamp - START) / 1000 + (last.timestamp - START) / 1000,
          (p.lon + 0.12) * M_LON + 500,
          held
        )
      );
    const points = [...before, ...after];
    const ratios = routePaceRatios(points, 300);
    expect(ratios[before.length]).toBeNull();
    // Held time is not running time: the stretches either side of the
    // stop read at the run's pace, not as a five-minute crawl.
    for (const i of [
      before.length - 1,
      before.length + 1,
      before.length + 20,
    ]) {
      expect(routePaceColor(ratios[i] as number)).toBe(middle);
    }
  });

  it("measures each piece of route on its own, across a gap", () => {
    // A cut (a privacy zone, say) between 1 km at 5:00 and 1 km at 4:00:
    // the faster piece is fast from its first stretch, not dragged towards
    // the slower one by a window reaching back across the gap.
    const first = road([[1000, 300]]);
    const second = road([[1000, 240]]).map((p, k) => ({
      ...fix(
        (p.timestamp - START) / 1000 +
          (first[first.length - 1].timestamp - START) / 1000 +
          60,
        (p.lon + 0.12) * M_LON + 1300
      ),
      ...(k === 0 ? { breakBefore: true } : {}),
    }));
    const points = [...first, ...second];
    const ratios = routePaceRatios(points, 270);
    expect(ratios[first.length]).toBeNull();
    expect(routePaceColor(ratios[first.length + 1] as number)).toBe(
      THEME.paceFast
    );
  });

  it("reads a short burst the same at the start of a run as in the middle", () => {
    // 60 m at 4:00 among steady 5:00 running. In the middle of the run the
    // 200 m around it is mostly steady running; at the very start the
    // window slides forward to cover 200 m too, rather than shrinking to
    // the burst and painting the start fast.
    const average = 300;
    const startBurst = road([
      [60, 240],
      [1000, 300],
    ]);
    const midBurst = road([
      [500, 300],
      [60, 240],
      [500, 300],
    ]);
    const atStart = routePaceRatios(startBurst, average)[1] as number;
    const burstMiddle = midBurst.findIndex(
      (p) => (p.lon + 0.12) * M_LON >= 530
    );
    const inMiddle = routePaceRatios(midBurst, average)[burstMiddle] as number;
    expect(routePaceColor(inMiddle)).toBe(middle);
    expect(routePaceColor(atStart)).toBe(routePaceColor(inMiddle));
  });

  it("measures nothing without an average to measure against", () => {
    const points = road([[500, 300]]);
    expect(routePaceRatios(points, 0).every((ratio) => ratio === null)).toBe(
      true
    );
  });
});
