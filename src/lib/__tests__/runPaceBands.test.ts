import { describe, it, expect } from "vitest";
import {
  PACE_BANDS,
  GAP_BAND,
  BAND_TOLERANCE,
  SMOOTHING_METRES,
  GAP_SECONDS,
  GAP_METRES,
  bandForRatio,
  bandForPace,
  isRecordingGap,
  smoothedSegmentPaces,
  hasRecordingGap,
} from "../runPaceBands";
import type { GPSPoint } from "../gps";

/**
 * Build a straight eastbound track at a commanded pace.
 *
 * `legs` is a list of [metres, secPerKm] — so a track can change pace
 * partway and the smoothing can be checked against a known answer rather
 * than against whatever the function happens to return.
 */
function track(
  legs: [metres: number, secPerKm: number][],
  opts: { sampleM?: number; startTs?: number } = {}
): GPSPoint[] {
  const sampleM = opts.sampleM ?? 5;
  let ts = opts.startTs ?? 1_700_000_000_000;
  let lon = 0;
  const METRES_PER_DEG_LON = 111_320; // at the equator, where lat = 0
  const pts: GPSPoint[] = [
    {
      lat: 0,
      lon: 0,
      altitude: null,
      accuracy: 5,
      speed: null,
      timestamp: ts,
      rawLat: 0,
      rawLon: 0,
    },
  ];
  for (const [metres, secPerKm] of legs) {
    const steps = Math.round(metres / sampleM);
    for (let i = 0; i < steps; i++) {
      lon += sampleM / METRES_PER_DEG_LON;
      ts += (sampleM / 1000) * secPerKm * 1000;
      pts.push({
        lat: 0,
        lon,
        altitude: null,
        accuracy: 5,
        speed: null,
        timestamp: Math.round(ts),
        rawLat: 0,
        rawLon: lon,
      });
    }
  }
  return pts;
}

describe("pace band table", () => {
  it("is symmetric about the run average", () => {
    /* The defect this replaces: 0.92 / 1.03 — 8% faster to go green but
       only 3% slower to leave the middle. An evenly-paced run came out
       mostly warm. Asserted as a PROPERTY of the table so a future edit
       that reintroduces a lopsided pair fails here. */
    const faster = PACE_BANDS.find((b) => b.id === "faster")!;
    const steady = PACE_BANDS.find((b) => b.id === "steady")!;
    expect(1 - faster.maxRatio).toBeCloseTo(steady.maxRatio - 1, 10);
    expect(1 - faster.maxRatio).toBeCloseTo(BAND_TOLERANCE, 10);
  });

  it("is ordered, and the last band is unbounded", () => {
    for (let i = 1; i < PACE_BANDS.length; i++) {
      expect(PACE_BANDS[i].maxRatio).toBeGreaterThan(PACE_BANDS[i - 1].maxRatio);
    }
    expect(PACE_BANDS[PACE_BANDS.length - 1].maxRatio).toBe(Infinity);
  });

  it("gives every band a distinct colour and label", () => {
    const all = [...PACE_BANDS, GAP_BAND];
    expect(new Set(all.map((b) => b.color)).size).toBe(all.length);
    expect(new Set(all.map((b) => b.label)).size).toBe(all.length);
  });

  it("never labels a band 'On pace' — there is no target to be on", () => {
    /* The comparison is against the run's own average. "On pace" asked a
       question the screen could not answer. */
    for (const b of [...PACE_BANDS, GAP_BAND]) {
      expect(b.label.toLowerCase()).not.toContain("on pace");
    }
  });

  it("bandForRatio covers the whole line, including the boundaries", () => {
    expect(bandForRatio(0.5).id).toBe("faster");
    expect(bandForRatio(1 - BAND_TOLERANCE - 1e-9).id).toBe("faster");
    // Exactly at the bound belongs to the NEXT band up — maxRatio is exclusive.
    expect(bandForRatio(1 - BAND_TOLERANCE).id).toBe("steady");
    expect(bandForRatio(1).id).toBe("steady");
    expect(bandForRatio(1 + BAND_TOLERANCE - 1e-9).id).toBe("steady");
    expect(bandForRatio(1 + BAND_TOLERANCE).id).toBe("slower");
    expect(bandForRatio(99).id).toBe("slower");
  });

  it("treats a missing pace or a meaningless average as 'no data'", () => {
    expect(bandForPace(null, 300).id).toBe("gap");
    expect(bandForPace(300, 0).id).toBe("gap");
    expect(bandForPace(300, Number.NaN).id).toBe("gap");
    expect(bandForPace(300, 300).id).toBe("steady");
  });
});

describe("recording gaps", () => {
  it("needs BOTH a long silence and real displacement", () => {
    expect(isRecordingGap(GAP_METRES + 1, GAP_SECONDS + 1)).toBe(true);
    // A red light: long silence, no displacement. That stretch IS honestly
    // slow and must stay coloured rather than be excused as missing data.
    expect(isRecordingGap(2, 120)).toBe(false);
    // A fast straight sample: real displacement, no silence.
    expect(isRecordingGap(GAP_METRES + 1, 2)).toBe(false);
  });

  it("hasRecordingGap agrees with what the painter would grey out", () => {
    const clean = track([[400, 300]]);
    expect(hasRecordingGap(clean)).toBe(false);
    expect(smoothedSegmentPaces(clean).some((p) => p === null)).toBe(false);

    const gapped = track([[200, 300]]);
    const last = gapped[gapped.length - 1];
    gapped.push({
      ...last,
      lon: last.lon + 400 / 111_320, // 400 m away
      timestamp: last.timestamp + 120_000, // two minutes later
    });
    expect(hasRecordingGap(gapped)).toBe(true);
    const paces = smoothedSegmentPaces(gapped);
    expect(paces[paces.length - 1]).toBeNull();
  });
});

describe("smoothedSegmentPaces", () => {
  it("returns one entry per segment", () => {
    const pts = track([[100, 300]]);
    expect(smoothedSegmentPaces(pts)).toHaveLength(pts.length - 1);
    expect(smoothedSegmentPaces([])).toEqual([]);
    expect(smoothedSegmentPaces([track([[10, 300]])[0]])).toEqual([]);
  });

  it("recovers a constant pace across the whole track", () => {
    const paces = smoothedSegmentPaces(track([[600, 330]]));
    for (const p of paces) expect(p!).toBeCloseTo(330, 0);
  });

  it("holds the window open at both ends instead of shrinking it", () => {
    /* A window that clamped to the track instead of sliding would compute
       the first and last segments over HALF the distance — the noise this
       exists to remove, reintroduced at the two points a reader looks at
       first (the start marker and the finish).

       A constant-pace track cannot tell the two apart: half a window of an
       even run reads the same as a whole one. This first version of the test
       did exactly that and passed against a deliberately clamping mutant.
       So the pace has to VARY inside the first window:

         50 m @ 4:00/km then 50 m @ 6:00/km, then an even remainder.

       A full 100 m window spans both legs — 12 s + 18 s over 100 m = 5:00/km.
       A clamped one spans 52.5 m, almost all of it the fast leg, and reads
       about 4:06/km. The two answers are 54 s/km apart, so the assertion
       below fails the moment the window stops sliding. */
    const paces = smoothedSegmentPaces(
      track([
        [50, 240],
        [50, 360],
        [500, 300],
      ])
    );
    expect(paces[0]!).toBeCloseTo(300, 0);

    // Same shape at the finish, mirrored.
    const tail = smoothedSegmentPaces(
      track([
        [500, 300],
        [50, 360],
        [50, 240],
      ])
    );
    expect(tail[tail.length - 1]!).toBeCloseTo(300, 0);
  });

  it("rejects the per-sample noise that made the line confetti", () => {
    /* The real defect: pace was computed over ONE sample pair — ~3 m at
       1 Hz — against a GPS error of about ±3 m. Model that directly: a
       runner holding an exactly even pace whose fixes jitter along the
       direction of travel. Unsmoothed, per-pair pace swings wildly; the
       smoothed series must stay inside the steady band.

       This is the test that fails if `smoothedSegmentPaces` is reduced to
       the old per-pair calculation. */
    const pts = track([[600, 330]], { sampleM: 5 });
    const METRES_PER_DEG_LON = 111_320;
    const jitter = [0, 2.5, -2.5, 1.8, -2.2, 0.9, -1.4];
    const noisy = pts.map((p, i) =>
      i === 0 || i === pts.length - 1
        ? p
        : { ...p, lon: p.lon + jitter[i % jitter.length] / METRES_PER_DEG_LON }
    );

    // What the OLD code saw, pair by pair.
    const perPair: number[] = [];
    for (let i = 1; i < noisy.length; i++) {
      const d =
        (noisy[i].lon - noisy[i - 1].lon) * METRES_PER_DEG_LON;
      const t = (noisy[i].timestamp - noisy[i - 1].timestamp) / 1000;
      if (d > 0 && t > 0) perPair.push((t / d) * 1000);
    }
    const worstPerPair = Math.max(...perPair.map((p) => Math.abs(p / 330 - 1)));
    expect(worstPerPair).toBeGreaterThan(BAND_TOLERANCE);

    // What the new code sees.
    const smoothed = smoothedSegmentPaces(noisy).filter(
      (p): p is number => p !== null
    );
    expect(smoothed.length).toBeGreaterThan(0);
    for (const p of smoothed) {
      expect(bandForPace(p, 330).id).toBe("steady");
    }
  });

  it("still separates a genuinely faster stretch from a slower one", () => {
    /* Smoothing that flattened everything would be worse than the noise —
       the line would be one colour and say nothing. 300 m at 4:00/km then
       300 m at 6:00/km, average 5:00/km. */
    const pts = track([
      [300, 240],
      [300, 360],
    ]);
    const paces = smoothedSegmentPaces(pts);
    const bands = paces.map((p) => bandForPace(p, 300).id);
    expect(bands[0]).toBe("faster");
    expect(bands[bands.length - 1]).toBe("slower");
    expect(new Set(bands)).toContain("faster");
    expect(new Set(bands)).toContain("slower");
  });

  it("does not let a gap's fictional pace leak into its neighbours", () => {
    /* Smoothing runs inside each gap-free stretch. If the window spanned a
       gap, the two minutes of unrecorded time would drag every real segment
       within ~50 m either side into "slower" — one wrong segment becoming a
       wrong neighbourhood. */
    const before = track([[300, 300]]);
    const last = before[before.length - 1];
    const jumped: GPSPoint = {
      ...last,
      lon: last.lon + 400 / 111_320,
      timestamp: last.timestamp + 120_000,
    };
    const after = track([[300, 300]], {
      startTs: jumped.timestamp,
    }).map((p) => ({ ...p, lon: p.lon + jumped.lon }));
    const pts = [...before, ...after];

    const paces = smoothedSegmentPaces(pts);
    const gapIndex = before.length - 1;
    expect(paces[gapIndex]).toBeNull();
    for (let i = 0; i < paces.length; i++) {
      if (i === gapIndex) continue;
      expect(bandForPace(paces[i], 300).id).toBe("steady");
    }
  });

  it("resolves a surge longer than the window, and dilutes a shorter one", () => {
    /* Pinning the constant itself would be a tautology, so pin what the
       window BUYS. A deviation is reported at full strength only once it
       fills the window; anything shorter is averaged against its
       surroundings in proportion to the share of the window it occupies.

       That is the whole mechanism, and it cuts both ways on purpose — it is
       why 3 m of GPS error disappears, and why a 400 m surge still shows.
       A window that erased the short surge entirely would be over-smoothed;
       one that reported it at full strength would be back to reading noise
       as pace. So: strictly diluted, and strictly not erased. */
    const fastest = (pts: GPSPoint[]) =>
      Math.min(
        ...smoothedSegmentPaces(pts).filter((p): p is number => p !== null)
      );

    const surge = fastest(
      track([
        [280, 300],
        [400, 180],
        [280, 300],
      ])
    );
    const blip = fastest(
      track([
        [280, 300],
        [40, 180],
        [280, 300],
      ])
    );

    // Longer than the window: fully resolved, reads the real surge pace.
    expect(surge).toBeCloseTo(180, 0);
    // Shorter than the window: visible, but nowhere near full strength.
    expect(blip).toBeGreaterThan(surge + 40);
    expect(blip).toBeLessThan(300);

    expect(SMOOTHING_METRES).toBeGreaterThan(40);
    expect(SMOOTHING_METRES).toBeLessThan(400);
  });
});
