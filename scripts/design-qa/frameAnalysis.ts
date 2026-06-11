/**
 * Design-QA frame analyzer (the "verify transitions at the frame level" loop,
 * adapted from the native-iOS technique to Tropos's web stack).
 *
 * The browser capture layer (e2e/design-qa/*.capture.spec.ts) records an
 * interaction and produces ONE number per adjacent frame pair: the
 * `changeRatio` — the fraction of pixels that changed beyond a small
 * per-channel threshold from frame i to frame i+1. That numeric time-series is
 * all this module needs, which is what makes the *judgement* pure and
 * deterministically testable without a browser.
 *
 * What a healthy transition's changeRatio series looks like:
 *   - rises and falls CONTINUOUSLY (no isolated spikes) — motion, not jumps;
 *   - has no near-zero gap in the MIDDLE of motion (no freeze/hitch);
 *   - SETTLES to ~0 by the end (the animation actually finished).
 *
 * The three jank signatures we flag:
 *   - POP / hitch:   an isolated changeRatio spike — the UI jumped
 *                    discontinuously instead of tweening.
 *   - STALL / drop:  a frozen frame sandwiched between moving ones — the
 *                    animation paused mid-flight (dropped frames / main-thread
 *                    jank).
 *   - NOT SETTLED:   the tail still shows motion — the transition didn't
 *                    converge within the capture window.
 */

export interface FrameAnalysisConfig {
  /** A frame pair counts as "in motion" above this changeRatio. */
  activeThreshold: number;
  /** The tail is "settled" when its diffs are all at/below this. */
  settleThreshold: number;
  /** How many trailing frame pairs must be settled to call it converged. */
  settleWindow: number;
  /** A pop must change at least this fraction of the screen (ignore noise). */
  popFloor: number;
  /** …and exceed this multiple of its local-neighbour median to be isolated. */
  popFactor: number;
}

export const DEFAULT_CONFIG: FrameAnalysisConfig = {
  activeThreshold: 0.006,
  settleThreshold: 0.01,
  settleWindow: 3,
  popFloor: 0.08,
  popFactor: 4,
};

export interface FrameAnalysis {
  /** Number of frame pairs analysed (captured frames − 1). */
  pairs: number;
  /** Did the transition converge to rest by the end of the window? */
  settled: boolean;
  /** Was any motion captured at all? (false = the trigger didn't animate.) */
  hasMotion: boolean;
  /** Frame-pair indices that are isolated spikes (pops/hitches). */
  pops: number[];
  /** Frame-pair indices that froze mid-motion (stalls/dropped frames). */
  stalls: number[];
  /** 0..1 — higher is smoother (low jerk in the change-ratio curve). */
  smoothness: number;
  /** Human-readable problems, empty when clean. */
  jankFlags: string[];
  /** The verdict: clean, converged, and actually animated. */
  ok: boolean;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Analyse a change-ratio series (one value per adjacent frame pair, each in
 * [0,1]) and report jank. Pure — no I/O, no clock, no browser.
 */
export function analyzeFrameDiffs(
  diffs: number[],
  config: Partial<FrameAnalysisConfig> = {}
): FrameAnalysis {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const pairs = diffs.length;
  const jankFlags: string[] = [];

  // The active region: first → last frame pair that shows real motion.
  const activeIdx = diffs
    .map((d, i) => (d > cfg.activeThreshold ? i : -1))
    .filter((i) => i >= 0);
  const hasMotion = activeIdx.length > 0;

  if (!hasMotion) {
    return {
      pairs,
      settled: true,
      hasMotion: false,
      pops: [],
      stalls: [],
      smoothness: 1,
      jankFlags: ["no motion captured — the interaction didn't animate"],
      ok: false,
    };
  }

  const firstActive = activeIdx[0];
  const lastActive = activeIdx[activeIdx.length - 1];

  // SETTLED: the trailing `settleWindow` pairs are all at rest.
  const tail = diffs.slice(Math.max(0, pairs - cfg.settleWindow));
  const settled =
    tail.length > 0 && tail.every((d) => d <= cfg.settleThreshold);
  if (!settled) {
    jankFlags.push(
      `transition never settles — tail still moving (${tail
        .map((d) => d.toFixed(3))
        .join(", ")})`
    );
  }

  // POPS: isolated spikes — large vs. their local neighbours (a discontinuity,
  // not sustained fast motion).
  const pops: number[] = [];
  for (let i = firstActive; i <= lastActive; i++) {
    if (diffs[i] < cfg.popFloor) continue;
    const neighbours = [diffs[i - 2], diffs[i - 1], diffs[i + 1], diffs[i + 2]]
      .filter((d) => d !== undefined)
      .map((d) => d as number);
    const localMedian = median(neighbours);
    if (diffs[i] >= cfg.popFactor * Math.max(localMedian, 1e-4)) {
      pops.push(i);
    }
  }
  if (pops.length) {
    jankFlags.push(
      `${pops.length} pop/hitch(es) — isolated visual jump at frame pair ${pops.join(", ")}`
    );
  }

  // STALLS: a frozen pair between two moving pairs inside the active region.
  const stalls: number[] = [];
  for (let i = firstActive + 1; i < lastActive; i++) {
    if (
      diffs[i] <= cfg.settleThreshold &&
      diffs[i - 1] > cfg.activeThreshold &&
      diffs[i + 1] > cfg.activeThreshold
    ) {
      stalls.push(i);
    }
  }
  if (stalls.length) {
    jankFlags.push(
      `${stalls.length} stall(s) — animation froze mid-flight at frame pair ${stalls.join(", ")}`
    );
  }

  // SMOOTHNESS: low jerk (mean |second difference|) over the active region,
  // normalised by the region's peak so it's scale-free.
  const region = diffs.slice(firstActive, lastActive + 1);
  let smoothness = 1;
  if (region.length >= 3) {
    const peak = Math.max(...region, 1e-4);
    let jerkSum = 0;
    for (let i = 1; i < region.length - 1; i++) {
      jerkSum += Math.abs(region[i + 1] - 2 * region[i] + region[i - 1]);
    }
    const meanJerk = jerkSum / (region.length - 2);
    smoothness = Math.max(0, 1 - meanJerk / peak);
  }

  return {
    pairs,
    settled,
    hasMotion,
    pops,
    stalls,
    smoothness,
    jankFlags,
    ok: settled && pops.length === 0 && stalls.length === 0,
  };
}
