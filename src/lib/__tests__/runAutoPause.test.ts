import { describe, it, expect } from "vitest";
import { runMotionState } from "../runAutoPause";
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
describe("auto-pause motion evidence", () => {
  it("keeps stop/resume hysteresis for fresh usable fixes", () => {
    expect(runMotionState(fix, NOW)).toBe("stationary");
    expect(runMotionState({ ...fix, speed: 0.5 }, NOW)).toBe("unknown");
    expect(runMotionState({ ...fix, speed: 1 }, NOW)).toBe("moving");
  });
  it.each([null, -1, NaN, Infinity])(
    "does not read speed %s as a stop or resume",
    (speed) => {
      expect(runMotionState({ ...fix, speed }, NOW)).toBe("unknown");
    }
  );
  it.each([36, 100, -1, NaN])(
    "does not use accuracy %s to control the clock",
    (accuracy) => {
      expect(runMotionState({ ...fix, accuracy }, NOW)).toBe("unknown");
    }
  );
  it("rejects stale, future, missing and malformed fixes", () => {
    expect(runMotionState(fix, NOW + 2500)).toBe("stationary");
    expect(runMotionState(fix, NOW + 2501)).toBe("unknown");
    expect(runMotionState(fix, NOW - 1)).toBe("unknown");
    expect(runMotionState({ ...fix, timestamp: NaN }, NOW)).toBe("unknown");
    expect(runMotionState(null, NOW)).toBe("unknown");
  });
});
