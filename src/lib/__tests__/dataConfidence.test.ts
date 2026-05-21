/**
 * dataConfidence — Hist5d unified suppression policy tests.
 *
 * Covers T1-T5 gates, suppression reason codes, recency check,
 * caveat copy + ETA computation, and the telemetry batch helper.
 */
import { describe, it, expect } from "vitest";
import {
  computeDataConfidence,
  suppressionCaveatCopy,
  makeSuppressionBatch,
  T1_SPARKLINE_MIN_POINTS,
  T2_DELTA_MIN_POINTS,
  T3_PROJECTION_MIN_POINTS,
  T3_PROJECTION_MIN_WINDOW_DAYS,
  T4_DONUT_MIN_LOGGED_DAYS,
  T5_BARS_MIN_COUNT,
} from "../dataConfidence";

function input(overrides: Partial<Parameters<typeof computeDataConfidence>[0]>) {
  return computeDataConfidence({
    pointsInWindow: 10,
    pointsInPriorWindow: 10,
    windowDays: 30,
    hasRecentPoint: true,
    ...overrides,
  });
}

describe("T1 — sparkline gate", () => {
  it("renders sparkline at threshold", () => {
    expect(input({ pointsInWindow: T1_SPARKLINE_MIN_POINTS }).hasSparkline).toBe(true);
  });

  it("suppresses sparkline just below threshold", () => {
    const result = input({ pointsInWindow: T1_SPARKLINE_MIN_POINTS - 1 });
    expect(result.hasSparkline).toBe(false);
    expect(result.suppressions.find((s) => s.decoration === "sparkline")?.reason).toBe(
      "insufficient_points",
    );
  });

  it("suppresses sparkline when recency check fails (backfilled-but-inactive)", () => {
    const result = input({ pointsInWindow: 100, hasRecentPoint: false });
    expect(result.hasSparkline).toBe(false);
    expect(result.suppressions.find((s) => s.decoration === "sparkline")?.reason).toBe(
      "no_recency",
    );
  });
});

describe("T2 — vs-last delta gate", () => {
  it("renders delta when both windows meet threshold", () => {
    expect(input({ pointsInWindow: 4, pointsInPriorWindow: 4 }).hasDelta).toBe(true);
  });

  it("suppresses delta when current window is thin", () => {
    const result = input({ pointsInWindow: 2, pointsInPriorWindow: 10 });
    expect(result.hasDelta).toBe(false);
    expect(result.suppressions.find((s) => s.decoration === "delta")?.reason).toBe(
      "insufficient_points",
    );
  });

  it("suppresses delta with distinct 'no_prior_window' reason on first period", () => {
    const result = input({ pointsInWindow: 10, pointsInPriorWindow: 0 });
    expect(result.hasDelta).toBe(false);
    expect(result.suppressions.find((s) => s.decoration === "delta")?.reason).toBe(
      "no_prior_window",
    );
  });

  it("suppresses delta when prior window is thin", () => {
    const result = input({ pointsInWindow: 10, pointsInPriorWindow: 2 });
    expect(result.hasDelta).toBe(false);
  });

  it("delta needs BOTH windows ≥ T2 (symmetric)", () => {
    // current 4 (ok) but prior 3 (below) → suppressed
    expect(
      input({ pointsInWindow: T2_DELTA_MIN_POINTS, pointsInPriorWindow: T2_DELTA_MIN_POINTS - 1 })
        .hasDelta,
    ).toBe(false);
  });
});

describe("T3 — trend projection gate", () => {
  it("renders projection when window + points + recency all meet thresholds", () => {
    expect(
      input({
        windowDays: T3_PROJECTION_MIN_WINDOW_DAYS,
        pointsInWindow: T3_PROJECTION_MIN_POINTS,
      }).hasProjection,
    ).toBe(true);
  });

  it("suppresses projection when window is too short", () => {
    const result = input({ windowDays: 7, pointsInWindow: 10 });
    expect(result.hasProjection).toBe(false);
    expect(result.suppressions.find((s) => s.decoration === "projection")?.reason).toBe(
      "below_minimum_window",
    );
  });

  it("suppresses projection when points are insufficient (window OK)", () => {
    const result = input({ windowDays: 30, pointsInWindow: 3 });
    expect(result.hasProjection).toBe(false);
    expect(result.suppressions.find((s) => s.decoration === "projection")?.reason).toBe(
      "insufficient_points",
    );
  });

  it("suppresses projection when recency check fails", () => {
    const result = input({ pointsInWindow: 50, windowDays: 90, hasRecentPoint: false });
    expect(result.hasProjection).toBe(false);
    expect(result.suppressions.find((s) => s.decoration === "projection")?.reason).toBe(
      "no_recency",
    );
  });
});

describe("T4 — donut / allocation gate", () => {
  it("renders donut at logged-days threshold", () => {
    expect(input({ loggedDays: T4_DONUT_MIN_LOGGED_DAYS }).hasDonut).toBe(true);
  });

  it("suppresses donut just below threshold", () => {
    const result = input({ loggedDays: T4_DONUT_MIN_LOGGED_DAYS - 1 });
    expect(result.hasDonut).toBe(false);
    expect(result.suppressions.find((s) => s.decoration === "donut")?.reason).toBe(
      "insufficient_logged_days",
    );
  });

  it("falls back to pointsInWindow when loggedDays omitted", () => {
    expect(
      computeDataConfidence({
        pointsInWindow: 10,
        pointsInPriorWindow: 10,
        windowDays: 30,
      }).hasDonut,
    ).toBe(true);
  });

  it("donut uses absolute logged days, NOT adherence percentage", () => {
    /* Hist5d pin 3 — 7 logged days at any window length keeps the
       donut. 7 / 14 (50% adherence) and 7 / 90 (7.8% adherence)
       both render the donut. Sample-size dominates. */
    expect(input({ loggedDays: 7, windowDays: 14 }).hasDonut).toBe(true);
    expect(input({ loggedDays: 7, windowDays: 90 }).hasDonut).toBe(true);
  });
});

describe("T5 — bar chart gate", () => {
  it("renders bars at threshold", () => {
    expect(input({ pointsInWindow: T5_BARS_MIN_COUNT }).hasBars).toBe(true);
  });

  it("suppresses bars below threshold", () => {
    const result = input({ pointsInWindow: 2 });
    expect(result.hasBars).toBe(false);
    expect(result.suppressions.find((s) => s.decoration === "bars")?.reason).toBe(
      "insufficient_points",
    );
  });
});

describe("Suppression payload shape", () => {
  it("emits one suppression per failed decoration, no duplicates", () => {
    const result = input({ pointsInWindow: 0, pointsInPriorWindow: 0, windowDays: 7 });
    const kinds = result.suppressions.map((s) => s.decoration);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("includes pointsAvailable for telemetry", () => {
    const result = input({ pointsInWindow: 2 });
    const sparkline = result.suppressions.find((s) => s.decoration === "sparkline");
    expect(sparkline?.pointsAvailable).toBe(2);
  });

  it("returns empty suppressions when all gates pass", () => {
    expect(
      input({
        pointsInWindow: 100,
        pointsInPriorWindow: 100,
        windowDays: 365,
        loggedDays: 100,
      }).suppressions,
    ).toEqual([]);
  });
});

describe("suppressionCaveatCopy", () => {
  it("returns patience copy for sparkline without rate", () => {
    expect(suppressionCaveatCopy("sparkline", 2)).toBe("Building chart · keep logging");
  });

  it("returns ETA for sparkline with rate", () => {
    /* Need 4 - 2 = 2 more points, at 0.5/day → 4 days */
    expect(suppressionCaveatCopy("sparkline", 2, 0.5)).toBe("Trending in ~4 days");
  });

  it("returns patience copy for projection without rate", () => {
    expect(suppressionCaveatCopy("projection", 2)).toBe("Building trend · check back");
  });

  it("returns ETA for projection with rate", () => {
    /* Need 5 - 2 = 3 more points, at 1/day → 3 days */
    expect(suppressionCaveatCopy("projection", 2, 1)).toBe("Trending in ~3 days");
  });

  it("returns 'Macro split in' prefix for donut ETA", () => {
    /* Need 7 - 3 = 4 more days, at 1/day → 4 days */
    expect(suppressionCaveatCopy("donut", 3, 1)).toBe("Macro split in ~4 days");
  });

  it("returns generic 'Building your macro split' for donut without rate", () => {
    expect(suppressionCaveatCopy("donut", 3)).toBe("Building your macro split");
  });

  it("returns 'First period' for delta — no ETA concept", () => {
    expect(suppressionCaveatCopy("delta", 0)).toBe("First period · no comparison");
  });

  it("returns 'Log first run' for bars — action-framed", () => {
    expect(suppressionCaveatCopy("bars", 0)).toBe("Log first run");
  });

  it("ETA falls back to patience copy when rate is 0", () => {
    expect(suppressionCaveatCopy("sparkline", 2, 0)).toBe("Building chart · keep logging");
  });

  it("ETA clamps to at least 1 day when computed remaining is 0", () => {
    /* Need 4 - 4 = 0 more points (already at threshold), but caller
       passed rate anyway — clamp to ~1 day to avoid "Trending in 0 days". */
    expect(suppressionCaveatCopy("sparkline", 4, 10)).toBe("Trending in ~1 days");
  });

  it("all caveat strings fit within 30-char budget", () => {
    /* Hist5d pin 6: ≤30 chars (English v1). */
    const decorations = ["sparkline", "projection", "donut", "delta", "bars"] as const;
    for (const d of decorations) {
      const copy = suppressionCaveatCopy(d, 0);
      expect(copy.length).toBeLessThanOrEqual(30);
    }
  });
});

describe("makeSuppressionBatch", () => {
  it("starts empty", () => {
    const batch = makeSuppressionBatch();
    expect(batch.isEmpty()).toBe(true);
    expect(batch.payload()).toEqual({ suppressions: [] });
  });

  it("aggregates suppressions across surfaces", () => {
    const batch = makeSuppressionBatch();
    const running = input({ pointsInWindow: 2 });
    const lifting = input({ pointsInWindow: 0 });
    batch.add("running", running.suppressions);
    batch.add("lifting", lifting.suppressions);
    const payload = batch.payload();
    expect(payload.suppressions.length).toBeGreaterThan(0);
    expect(payload.suppressions.some((s) => s.surface === "running")).toBe(true);
    expect(payload.suppressions.some((s) => s.surface === "lifting")).toBe(true);
  });

  it("preserves all telemetry fields (surface + decoration + reason + count)", () => {
    const batch = makeSuppressionBatch();
    batch.add("nutrition", input({ pointsInWindow: 2, loggedDays: 3 }).suppressions);
    const first = batch.payload().suppressions[0];
    expect(first.surface).toBe("nutrition");
    expect(typeof first.decoration).toBe("string");
    expect(typeof first.reason).toBe("string");
    expect(typeof first.pointsAvailable).toBe("number");
  });

  it("isEmpty() reflects current state after adds", () => {
    const batch = makeSuppressionBatch();
    batch.add("x", input({ pointsInWindow: 0 }).suppressions);
    expect(batch.isEmpty()).toBe(false);
  });
});
