/**
 * Auto-pause's decision table: each scenario is a timeline of GPS fixes
 * and motion samples, played through the new rule (`stepAutoPause`, stepped
 * as Run.tsx steps it: on every fix, every motion sample and every pending
 * window's close) and through the GPS-only rule it replaced (`legacyRun`, a
 * copy of the old Run.tsx effect). Where the old rule was wrong the test
 * says so and pins both answers, so each row fails on the old rule and
 * passes on the new one.
 */
import { describe, it, expect } from "vitest";
import {
  AUTO_PAUSE_IDLE,
  EMPTY_MOTION,
  GPS_OVERRIDE_HOLD_MS,
  autoPauseEvidence,
  foldMotion,
  footState,
  gpsSpeed,
  stepAutoPause,
  type AutoPauseReason,
  type AutoPauseState,
  type MotionReading,
  type MotionSample,
} from "../runAutoPause";
import type { GPSPoint } from "../gps";

const NOW = 1_700_000_000_000;
const fix: GPSPoint = {
  lat: 0,
  lon: 0,
  rawLat: 0,
  rawLon: 0,
  altitude: null,
  accuracy: 5,
  timestamp: NOW,
  speed: 0,
};

/** The GPS-only rule's reading of one fix: stationary under 0.5 m/s,
 *  moving at 1 m/s or more, nothing between. The new rule reads the same
 *  bands (`GPS_STATIONARY_MPS`, `GPS_MOVING_MPS`) through `gpsSpeed`. */
function gpsOnlyState(
  point: GPSPoint | null,
  now: number
): "stationary" | "moving" | "unknown" {
  const speed = gpsSpeed(point, now);
  if (speed === null) return "unknown";
  if (speed < 0.5) return "stationary";
  return speed >= 1 ? "moving" : "unknown";
}

describe("GPS evidence", () => {
  const reason = (point: GPSPoint | null, now = NOW) =>
    autoPauseEvidence({ now, gps: point, motion: null, inRecovery: false }, NOW)
      .reason;

  it("keeps stop/resume hysteresis for fresh usable fixes", () => {
    expect(reason(fix)).toBe("gps-stationary");
    expect(reason({ ...fix, speed: 0.5 })).toBe("no-evidence");
    expect(reason({ ...fix, speed: 0.99 })).toBe("no-evidence");
    expect(reason({ ...fix, speed: 1 })).toBe("gps-moving");
  });
  it.each([null, -1, NaN, Infinity])(
    "does not read speed %s as a stop or resume",
    (speed) => {
      expect(gpsSpeed({ ...fix, speed }, NOW)).toBeNull();
      expect(reason({ ...fix, speed })).toBe("no-evidence");
    }
  );
  it.each([36, 100, -1, NaN])(
    "does not use accuracy %s to control the clock",
    (accuracy) => {
      expect(gpsSpeed({ ...fix, accuracy }, NOW)).toBeNull();
    }
  );
  it("rejects stale, future, missing and malformed fixes", () => {
    expect(gpsSpeed(fix, NOW + 2500)).toBe(0);
    expect(gpsSpeed(fix, NOW + 2501)).toBeNull();
    expect(gpsSpeed(fix, NOW - 1)).toBeNull();
    expect(gpsSpeed({ ...fix, timestamp: NaN }, NOW)).toBeNull();
    expect(gpsSpeed(null, NOW)).toBeNull();
  });
});

/* ── Timelines ─────────────────────────────────────────────────────── */

/** Seconds from when auto-pause came into play (Go). */
type Second = number;
const ms = (s: Second) => NOW + Math.round(s * 1000);

interface Timeline {
  /** One fix a second from `from` to `to` inclusive. */
  fixes: { at: Second; speed: number | null; accuracy: number }[];
  samples: { at: Second; sample: MotionSample }[];
  /** Seconds the session player spends in a recovery segment. */
  recovery: [Second, Second][];
  end: Second;
}

function timeline(end: Second): Timeline {
  return { fixes: [], samples: [], recovery: [], end };
}

function gps(
  t: Timeline,
  from: Second,
  to: Second,
  speed: number | null | ((s: Second) => number | null),
  accuracy = 5
) {
  for (let s = from; s <= to; s++)
    t.fixes.push({
      at: s,
      speed: typeof speed === "function" ? speed(s) : speed,
      accuracy,
    });
  return t;
}

/** Pedometer updates every 2.5 s while stepping (WWDC14 612), counting
 *  from wherever the timeline's count has reached. */
function steps(t: Timeline, from: Second, to: Second, cadence: number) {
  const last = t.samples
    .map((s) => s.sample)
    .filter((s): s is Extract<MotionSample, { kind: "steps" }> => {
      return s.kind === "steps";
    })
    .at(-1);
  let count = last?.steps ?? 0;
  for (let s = from; s <= to; s += 2.5) {
    count += Math.round(cadence * 2.5);
    t.samples.push({
      at: s,
      sample: { kind: "steps", at: ms(s), steps: count, cadence },
    });
  }
  return t;
}

function stepEvent(t: Timeline, at: Second, moving: boolean) {
  t.samples.push({ at, sample: { kind: "stepEvent", at: ms(at), moving } });
  return t;
}

function activity(
  t: Timeline,
  at: Second,
  kind: Extract<MotionSample, { kind: "activity" }>["activity"],
  confidence: "low" | "medium" | "high" = "high"
) {
  t.samples.push({
    at,
    sample: { kind: "activity", at: ms(at), activity: kind, confidence },
  });
  return t;
}

interface Change {
  at: Second;
  change: "pause" | "resume";
  reason?: AutoPauseReason;
}

const toFix = (f: Timeline["fixes"][number]): GPSPoint => ({
  ...fix,
  timestamp: ms(f.at),
  speed: f.speed,
  accuracy: f.accuracy,
});

/** The new rule, stepped as Run.tsx steps it: on each fix and motion
 *  sample as it arrives, and when a pending window is due. `motion: false`
 *  is the web, with no motion source. */
function newRun(t: Timeline, { motion = true } = {}): Change[] {
  type Arrival =
    { at: number; fix: GPSPoint } | { at: number; sample: MotionSample };
  const arrivals: Arrival[] = [
    ...t.fixes.map((f) => ({ at: ms(f.at), fix: toFix(f) })),
    ...(motion
      ? t.samples.map((s) => ({ at: ms(s.at), sample: s.sample }))
      : []),
  ].sort((a, b) => a.at - b.at);
  let state: AutoPauseState = AUTO_PAUSE_IDLE;
  let latest: GPSPoint | null = null;
  let reading: MotionReading | null = null;
  let recheckAt: number | null = null;
  const changes: Change[] = [];
  const step = (now: number) => {
    const s = (now - NOW) / 1000;
    const result = stepAutoPause(state, {
      now,
      gps: latest,
      motion: reading,
      inRecovery: t.recovery.some(([a, b]) => s >= a && s < b),
    });
    state = result.state;
    recheckAt = result.recheckAt;
    if (result.change)
      changes.push({ at: s, change: result.change, reason: result.reason });
  };
  step(NOW);
  let i = 0;
  while (true) {
    const next = arrivals[i]?.at ?? Infinity;
    if (recheckAt !== null && recheckAt <= next && recheckAt <= ms(t.end)) {
      step(recheckAt);
      continue;
    }
    if (next > ms(t.end)) break;
    const arrival = arrivals[i++];
    if ("fix" in arrival) latest = arrival.fix;
    else reading = foldMotion(reading ?? EMPTY_MOTION, arrival.sample);
    step(arrival.at);
  }
  return changes.map(({ at, change, reason }) => ({ at, change, reason }));
}

/** The GPS-only rule this replaced, as the old Run.tsx effect ran it: on
 *  each fix, a stationary reading arms a five-second timer once, which
 *  pauses if the latest fix is still stationary when it fires; anything
 *  else cancels it, and a moving reading resumes. */
function legacyRun(t: Timeline): Change[] {
  const fixes = t.fixes.map(toFix);
  let paused = false;
  let timerAt: number | null = null;
  let latest: GPSPoint | null = null;
  const changes: Change[] = [];
  let i = 0;
  while (true) {
    const next = fixes[i]?.timestamp ?? Infinity;
    if (timerAt !== null && timerAt <= next && timerAt <= ms(t.end)) {
      const at = timerAt;
      timerAt = null;
      if (gpsOnlyState(latest, at) === "stationary") {
        paused = true;
        changes.push({ at: (at - NOW) / 1000, change: "pause" });
      }
      continue;
    }
    if (next > ms(t.end)) break;
    latest = fixes[i++];
    const now = latest.timestamp;
    const state = gpsOnlyState(latest, now);
    if (state === "stationary" && !paused) {
      timerAt ??= now + 5000;
    } else {
      timerAt = null;
      if (state === "moving" && paused) {
        paused = false;
        changes.push({ at: (now - NOW) / 1000, change: "resume" });
      }
    }
  }
  return changes;
}

const kinds = (changes: Change[]) => changes.map((c) => `${c.change}@${c.at}`);

/** Seconds the clock stood still between `from` and `to`. */
function heldSeconds(changes: Change[], from: Second, to: Second): number {
  let held = 0;
  let pausedAt: number | null = null;
  for (const c of changes) {
    if (c.change === "pause") pausedAt = c.at;
    else if (pausedAt !== null) {
      held += Math.min(c.at, to) - Math.max(pausedAt, from);
      pausedAt = null;
    }
  }
  if (pausedAt !== null) held += to - Math.max(pausedAt, from);
  return Math.max(0, held);
}

/** A minute of running before whatever the scenario does: 3 m/s on GPS,
 *  steps at 2.8 a second (168 a minute), the classifier reading running. */
function runningMinute(end: Second): Timeline {
  const t = timeline(end);
  stepEvent(t, 0.4, true);
  activity(t, 1, "running");
  steps(t, 0.5, 58, 2.8);
  return gps(t, 0, 59, 3);
}

/* ── The decision table ────────────────────────────────────────────── */

describe("auto-pause decision table", () => {
  it("a crossing, clean GPS, phone in a pocket: pauses within 4 s of the stop, not 8, and resumes at the first step", () => {
    const t = runningMinute(150);
    // Stops at 60. The pedometer's last update carries its last steps;
    // its pause event follows; the classifier reads the phone still.
    steps(t, 60.5, 60.5, 2.8);
    stepEvent(t, 61.3, false);
    activity(t, 64, "stationary");
    gps(t, 60, 61, (s) => (s === 60 ? 2.2 : 1.2));
    gps(t, 62, 119, (s) => (s === 62 ? 0.6 : 0.1));
    // Sets off at 120: the resume event comes first, GPS a second later.
    stepEvent(t, 120.6, true);
    steps(t, 122.5, 148, 2.8);
    activity(t, 124, "running");
    gps(t, 120, 150, (s) => (s === 120 ? 0.2 : s === 121 ? 0.8 : 3));

    expect(kinds(newRun(t))).toEqual(["pause@64", "resume@120.6"]);
    expect(kinds(legacyRun(t))).toEqual(["pause@68", "resume@122"]);
    // Strava's own note: a GPS-only stop costs "5 seconds or more" of
    // standing counted as running. The stop is 60 s long:
    expect(heldSeconds(newRun(t), 60, 125)).toBeCloseTo(56.6, 5);
    expect(heldSeconds(legacyRun(t), 60, 125)).toBe(54);
  });

  it("lights, GPS drifting 1 to 2 m/s, phone still: pauses and stays paused (GPS-only never paused)", () => {
    const t = runningMinute(150);
    steps(t, 60.5, 60.5, 2.8);
    stepEvent(t, 61.3, false);
    activity(t, 64, "stationary");
    // Drift between tall buildings: every reading 1 to 2 m/s.
    const drift = [1.9, 1.2, 1.8, 1.4, 2, 1.1, 1.6, 1.3];
    gps(t, 60, 149, (s) => drift[s % drift.length]);
    stepEvent(t, 149.5, true);

    // Still from 64. A step was counted at 60.5, so the phone reads still
    // once that is five seconds old; the next fix (66) opens the window,
    // and it closes 2 s on. Until then drift over 1 m/s counts, as the
    // phone could still be on someone moving.
    expect(kinds(newRun(t))).toEqual(["pause@68", "resume@149.5"]);
    // Wrong on GPS alone: drift never read under 0.5 m/s.
    expect(kinds(legacyRun(t))).toEqual([]);
  });

  it("drift after a stop: a still phone is not restarted by GPS alone (GPS-only resumed on the first drifting fix)", () => {
    const t = runningMinute(130);
    steps(t, 60.5, 60.5, 2.8);
    stepEvent(t, 61, false);
    activity(t, 63, "stationary");
    gps(t, 60, 79, (s) => (s === 60 ? 1.5 : 0.1));
    gps(t, 80, 129, (s) => [1.3, 1.7, 1.1, 2.2][s % 4]);

    // Steps stopped at 61 with GPS under 1 m/s: 2 s later.
    expect(kinds(newRun(t))).toEqual(["pause@63"]);
    // Wrong on GPS alone: standing still, resumed at 80.
    expect(kinds(legacyRun(t))).toEqual(["pause@66", "resume@80"]);
  });

  it("a drifting fix past 2.5 m/s must hold for two seconds before it overrides a still phone", () => {
    const t = runningMinute(130);
    steps(t, 60.5, 60.5, 2.8);
    stepEvent(t, 61, false);
    activity(t, 63, "stationary");
    gps(t, 60, 89, (s) => (s === 60 ? 1.5 : 0.1));
    // One spike, then a buggy pushed off at 3 m/s with no steps.
    gps(t, 90, 90, 2.7);
    gps(t, 91, 99, 0.1);
    gps(t, 100, 129, 3);

    const changes = newRun(t);
    expect(kinds(changes)).toEqual(["pause@63", "resume@102"]);
    expect(changes[1].reason).toBe("gps-clearly-moving");
    expect(GPS_OVERRIDE_HOLD_MS).toBe(2000);
  });

  it("jogging on the spot at a crossing: the clock keeps running, as Strava's does (GPS-only paused)", () => {
    const t = runningMinute(120);
    steps(t, 60.5, 118, 2.6);
    gps(t, 60, 119, (s) => [0.1, 0.3, 0.2][s % 3]);

    expect(kinds(newRun(t))).toEqual([]);
    expect(kinds(legacyRun(t))).toEqual(["pause@65"]);
  });

  it("a steep hill at 1.5 m/s: never paused, by either rule", () => {
    const t = runningMinute(180);
    steps(t, 60.5, 178, 2.5);
    gps(t, 60, 179, 1.5);
    expect(kinds(newRun(t))).toEqual([]);
    expect(kinds(legacyRun(t))).toEqual([]);
  });

  it("a climb steep enough to walk, 0.4 m/s on the map: never paused (GPS-only paused a moving runner)", () => {
    const t = runningMinute(180);
    activity(t, 95, "walking");
    steps(t, 60.5, 178, 1.7);
    gps(t, 60, 179, (s) => (s >= 100 && s < 140 ? 0.4 : 1.5));

    expect(kinds(newRun(t))).toEqual([]);
    expect(kinds(legacyRun(t))).toEqual(["pause@105", "resume@140"]);
  });

  describe("a run-walk session's walk break (a recovery segment, 120 to 210 s)", () => {
    function runWalk(walk: (t: Timeline) => void): Timeline {
      const t = runningMinute(270);
      steps(t, 60.5, 118, 2.8);
      gps(t, 60, 119, 3);
      t.recovery.push([120, 210]);
      walk(t);
      // Running again at 210.
      stepEvent(t, 210.4, true);
      activity(t, 213, "running");
      steps(t, 210.5, 268, 2.8);
      gps(t, 210, 269, 3);
      return t;
    }

    it("a brisk walk: never paused, by either rule", () => {
      const t = runWalk((t) => {
        activity(t, 125, "walking");
        steps(t, 120.5, 208, 1.8);
        gps(t, 120, 209, 1.3);
      });
      expect(kinds(newRun(t))).toEqual([]);
      expect(kinds(legacyRun(t))).toEqual([]);
    });

    it("a slow walk uphill, 0.4 m/s: never paused (GPS-only stopped the walk's clock)", () => {
      const t = runWalk((t) => {
        activity(t, 125, "walking");
        steps(t, 120.5, 208, 1.5);
        gps(t, 120, 209, 0.4);
      });
      expect(kinds(newRun(t))).toEqual([]);
      expect(kinds(legacyRun(t))).toEqual(["pause@125", "resume@210"]);
    });

    it("standing through the walk: the walk's time is the plan's, so never paused (GPS-only froze it until the runner moved)", () => {
      const t = runWalk((t) => {
        stepEvent(t, 121, false);
        activity(t, 124, "stationary");
        gps(t, 120, 209, 0);
      });
      expect(kinds(newRun(t))).toEqual([]);
      expect(kinds(newRun(t, { motion: false }))).toEqual([]);
      expect(kinds(legacyRun(t))).toEqual(["pause@125", "resume@210"]);
    });

    it("standing once the run segment after it has begun is a stop again", () => {
      const t = runWalk(() => {});
      t.fixes = t.fixes.filter((f) => f.at < 210);
      t.samples = t.samples.filter((s) => s.at < 210);
      // The walk ends at 210 with the runner standing still.
      stepEvent(t, 200, false);
      activity(t, 203, "stationary");
      gps(t, 120, 269, 0);
      expect(kinds(newRun(t))).toEqual(["pause@212"]);
    });
  });

  describe("GPS lost in a tunnel", () => {
    it("running through it: never paused, by either rule", () => {
      const t = runningMinute(150);
      steps(t, 60.5, 148, 2.8);
      gps(t, 120, 150, 3); // out the other side
      expect(kinds(newRun(t))).toEqual([]);
      expect(kinds(legacyRun(t))).toEqual([]);
    });

    it("set off into it from a stop: resumes at the first step (GPS-only stayed paused until the far end)", () => {
      const t = runningMinute(180);
      stepEvent(t, 61, false);
      activity(t, 64, "stationary");
      gps(t, 60, 89, 0);
      stepEvent(t, 90.5, true);
      activity(t, 94, "running");
      steps(t, 92.5, 178, 2.8);
      gps(t, 150, 180, 3);

      expect(kinds(newRun(t))).toEqual(["pause@63", "resume@90.5"]);
      // Wrong on GPS alone: an hour's worth of tunnel is not paused time.
      expect(kinds(legacyRun(t))).toEqual(["pause@65", "resume@150"]);
      expect(heldSeconds(legacyRun(t), 90, 150)).toBe(60);
    });

    it("stopped inside it: pauses on the sensors (GPS-only could not pause with no fix)", () => {
      const t = runningMinute(160);
      steps(t, 60.5, 88, 2.8);
      stepEvent(t, 90.8, false);
      activity(t, 94, "stationary");
      stepEvent(t, 120.5, true);
      steps(t, 122.5, 158, 2.8);
      gps(t, 150, 160, 3);

      expect(kinds(newRun(t))).toEqual(["pause@92.8", "resume@120.5"]);
      expect(kinds(legacyRun(t))).toEqual([]);
    });
  });

  describe("the phone in a bag", () => {
    it("steps felt, GPS too coarse to use, the classifier unsure: pauses and resumes on the steps (GPS-only never paused)", () => {
      const t = timeline(140);
      stepEvent(t, 0.4, true);
      activity(t, 1, "running", "low");
      steps(t, 0.5, 58, 2.8);
      gps(t, 0, 139, (s) => (s < 60 || s >= 100 ? 3 : 0), 50);
      stepEvent(t, 61.2, false);
      stepEvent(t, 100.6, true);
      steps(t, 102.5, 138, 2.8);

      expect(kinds(newRun(t))).toEqual(["pause@63.2", "resume@100.6"]);
      expect(kinds(legacyRun(t))).toEqual([]);
    });

    it("no steps felt at all: GPS decides, exactly as before", () => {
      const t = timeline(140);
      activity(t, 1, "other", "medium");
      gps(t, 0, 139, (s) => (s < 60 || s >= 100 ? 3 : 0));
      expect(kinds(newRun(t))).toEqual(kinds(legacyRun(t)));
      expect(kinds(newRun(t))).toEqual(["pause@65", "resume@100"]);
    });
  });

  it("a buggy or a wheelchair, moving with no steps: a stray pause event does not stop a clock GPS sees moving", () => {
    const t = timeline(120);
    activity(t, 1, "other", "medium");
    stepEvent(t, 30, true);
    stepEvent(t, 32, false);
    gps(t, 0, 119, 2);
    expect(kinds(newRun(t))).toEqual([]);
  });

  it("the web, with no motion source, keeps the GPS-only rule on every row outside a recovery", () => {
    const rows: Timeline[] = [];
    const crossing = runningMinute(150);
    gps(crossing, 60, 119, 0.1);
    gps(crossing, 120, 150, 3);
    rows.push(crossing);
    const drift = runningMinute(150);
    gps(drift, 60, 149, (s) => [1.9, 1.2, 0.3, 0.2, 0.1, 0.4, 0.2, 0.3][s % 8]);
    rows.push(drift);
    const sag = runningMinute(180);
    gps(sag, 60, 179, (s) => (s >= 100 && s < 140 ? 0.4 : 1.5));
    rows.push(sag);
    const band = runningMinute(120);
    gps(band, 60, 119, (s) => [0.4, 0.6, 0.45, 0.9, 0.2][s % 5]);
    rows.push(band);
    const tunnel = runningMinute(180);
    gps(tunnel, 60, 89, 0);
    gps(tunnel, 150, 180, 3);
    rows.push(tunnel);
    for (const row of rows)
      expect(kinds(newRun(row, { motion: false }))).toEqual(
        kinds(legacyRun(row))
      );
  });
});

/* ── The parts ─────────────────────────────────────────────────────── */

describe("the motion reading", () => {
  const fold = (...samples: MotionSample[]) =>
    samples.reduce(foldMotion, EMPTY_MOTION);

  it("reads a low-confidence answer as no answer, ending the last one", () => {
    const r = fold(
      {
        kind: "activity",
        at: ms(1),
        activity: "stationary",
        confidence: "high",
      },
      { kind: "activity", at: ms(2), activity: "walking", confidence: "low" }
    );
    expect(r.activity).toEqual({ at: ms(2), kind: "unknown" });
    expect(footState(r, ms(3), NOW)).toBe("unknown");
  });

  it("does not count shuffling under 60 steps a minute as stepping", () => {
    const r = fold(
      { kind: "steps", at: ms(1), steps: 2, cadence: 0.8 },
      { kind: "steps", at: ms(3.5), steps: 4, cadence: 0.8 }
    );
    expect(r.stepAt).toBeNull();
    expect(footState(r, ms(4), NOW)).toBe("unknown");
    const walking = foldMotion(r, {
      kind: "steps",
      at: ms(6),
      steps: 8,
      cadence: 1.6,
    });
    expect(footState(walking, ms(6), NOW)).toBe("stepping");
  });

  it("after a pause event, needs two counted updates to read stepping again", () => {
    let r = fold(
      { kind: "stepEvent", at: ms(10), moving: false },
      { kind: "steps", at: ms(5), steps: 10, cadence: 2.8 },
      { kind: "steps", at: ms(11), steps: 14, cadence: 2.8 }
    );
    expect(footState(r, ms(11), NOW)).toBe("stopped");
    r = foldMotion(r, { kind: "steps", at: ms(13.5), steps: 21, cadence: 2.8 });
    expect(footState(r, ms(13.5), NOW)).toBe("stepping");
  });

  it("lets counted steps go stale after two missed updates", () => {
    const r = fold({ kind: "steps", at: ms(1), steps: 7, cadence: 2.8 });
    expect(footState(r, ms(6), NOW)).toBe("stepping");
    expect(footState(r, ms(6.01), NOW)).toBe("unknown");
  });

  it("ignores stop evidence from before auto-pause came into play", () => {
    const r = fold(
      {
        kind: "activity",
        at: ms(-30),
        activity: "stationary",
        confidence: "high",
      },
      { kind: "stepEvent", at: ms(-5), moving: false }
    );
    expect(footState(r, ms(1), ms(0))).toBe("unknown");
    expect(footState(r, ms(1), ms(-40))).toBe("stopped");
  });

  it("an unavailable source is no evidence", () => {
    const r = fold(
      { kind: "steps", at: ms(1), steps: 7, cadence: 2.8 },
      { kind: "unavailable" }
    );
    expect(r.available).toBe(false);
    expect(footState(r, ms(1), NOW)).toBe("unknown");
  });
});

describe("the step", () => {
  const stepping: MotionReading = {
    ...EMPTY_MOTION,
    stepEvent: { at: NOW, moving: true },
  };

  it("asks to look again when a window would close", () => {
    const first = stepAutoPause(AUTO_PAUSE_IDLE, {
      now: NOW,
      gps: fix,
      motion: null,
      inRecovery: false,
    });
    expect(first).toMatchObject({
      change: null,
      recheckAt: NOW + 5000,
      reason: "gps-stationary",
    });
    const due = stepAutoPause(first.state, {
      now: NOW + 5000,
      gps: { ...fix, timestamp: NOW + 4000 },
      motion: null,
      inRecovery: false,
    });
    expect(due.change).toBe("pause");
  });

  it("stops nothing when the fix has gone stale by the window's close", () => {
    const first = stepAutoPause(AUTO_PAUSE_IDLE, {
      now: NOW,
      gps: fix,
      motion: null,
      inRecovery: false,
    });
    const due = stepAutoPause(first.state, {
      now: NOW + 5000,
      gps: fix,
      motion: null,
      inRecovery: false,
    });
    expect(due.change).toBeNull();
    expect(due.state.stoppingSince).toBeNull();
  });

  it("restarts at once on steps, and keeps when auto-pause came into play", () => {
    const paused: AutoPauseState = {
      ...AUTO_PAUSE_IDLE,
      paused: true,
      armedAt: NOW - 60_000,
    };
    const step = stepAutoPause(paused, {
      now: NOW,
      gps: null,
      motion: stepping,
      inRecovery: false,
    });
    expect(step.change).toBe("resume");
    expect(step.state).toEqual({
      paused: false,
      armedAt: NOW - 60_000,
      stoppingSince: null,
      goingSince: null,
    });
  });
});
