/**
 * One stretch rule (Run26 call 3): the segment maker's, which says "A
 * segment needs to be at least 400 m." before it asks, and the server's,
 * which refuses the same stretch in the same words.
 *
 * The app's copy (`src/lib/segments.ts`) and the running one
 * (`functions/lib/segmentGeometry.js`, called by `createSegment`) are driven
 * here on the same traces, so a limit or a sentence changed on one side
 * fails until the other follows. Were the app's limit lower, a stretch the
 * maker offered would be refused on Save; higher, one it refused would
 * have been made.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  MAX_SEGMENT_METRES,
  MIN_SEGMENT_METRES,
  SEGMENT_NAME_MAX,
  STRETCH_REFUSALS,
  stretchOf,
  segmentNameRefusal,
} from "@/lib/segments";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/segmentGeometry.js") as {
  MIN_SEGMENT_METRES: number;
  MAX_SEGMENT_METRES: number;
  SEGMENT_NAME_MAX: number;
  STRETCH_REFUSALS: Record<string, string>;
  stretchOf: (
    points: unknown[],
    start: number,
    end: number
  ) => { metres?: number; reason?: string; refusal?: string };
};
const store = require("../../../functions/lib/segments.js") as {
  REFUSALS: Record<string, string>;
  segmentName: (value: string) => string;
};

/** A trace east from a point in south London, a point every `step` m. */
function trace(count: number, step: number, breakAt = -1) {
  const lat = 51.4433;
  const mPerDegLon =
    (Math.PI / 180) * 6371000 * Math.cos((lat * Math.PI) / 180);
  return Array.from({ length: count }, (_, i) => ({
    lat,
    lon: -0.1517 + (i * step) / mPerDegLon,
    ...(i === breakAt ? { breakBefore: true } : {}),
  }));
}

describe("the stretch rule, app and server", () => {
  it("holds the same limits and the same words", () => {
    expect(MIN_SEGMENT_METRES).toBe(server.MIN_SEGMENT_METRES);
    expect(MAX_SEGMENT_METRES).toBe(server.MAX_SEGMENT_METRES);
    expect(SEGMENT_NAME_MAX).toBe(server.SEGMENT_NAME_MAX);
    expect({ ...STRETCH_REFUSALS }).toEqual({ ...server.STRETCH_REFUSALS });
  });

  it.each([
    ["a kilometre", trace(60, 20), 5, 55],
    ["just short of the shortest", trace(60, 20), 10, 29],
    ["just past the shortest", trace(60, 20), 10, 31],
    ["an end before the start", trace(60, 20), 40, 10],
    ["an end past the trace", trace(60, 20), 0, 60],
    ["a gap inside", trace(60, 20, 30), 10, 50],
    ["a gap at its own start", trace(60, 20, 10), 10, 50],
    ["longer than the longest", trace(120, 500), 0, 119],
  ])("answers %s the same way", (_name, points, start, end) => {
    const app = stretchOf(points, start, end);
    const theirs = server.stretchOf(points, start, end);
    if (app.ok) {
      expect(theirs.refusal).toBeUndefined();
      expect(app.metres).toBeCloseTo(theirs.metres ?? NaN, 6);
    } else {
      expect(theirs.reason).toBe(app.reason);
      expect(theirs.refusal).toBe(app.refusal);
    }
  });

  it("refuses an empty or a long name in the server's words", () => {
    expect(segmentNameRefusal("   ")).toBe(store.REFUSALS.noName);
    expect(segmentNameRefusal("x".repeat(SEGMENT_NAME_MAX + 1))).toBe(
      store.REFUSALS.longName
    );
    expect(segmentNameRefusal("  Common   straight ")).toBeNull();
    expect(store.segmentName("  Common   straight ")).toBe("Common straight");
  });
});
