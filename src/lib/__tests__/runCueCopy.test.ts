/**
 * Run coaching cue copy — warm register, ear-first phrasing, deterministic
 * variation. Pins: "per kilometre" (never "per K"), variation pools rotate
 * by counter, and every cue path returns non-empty speakable text.
 */
import { describe, it, expect } from "vitest";
import {
  splitCue,
  timeCue,
  paceAlertCue,
  halfwayCue,
  final500Cue,
  pbCue,
  phaseCue,
} from "../runCueCopy";

describe("splitCue", () => {
  it("speaks whole-km splits with 'per kilometre', never 'per K'", () => {
    const cue = splitCue(3, "5:44", "steady", 0);
    expect(cue).toContain("3 kilometres");
    expect(cue).toContain("Pace 5:44 per kilometre");
    expect(cue).not.toMatch(/per K\b/);
  });

  it("singular for the first kilometre; decimals for 500m mode", () => {
    expect(splitCue(1, "6:00", null, 0)).toContain("1 kilometre.");
    expect(splitCue(1.5, "6:00", null, 0)).toContain("1.5 kilometres");
  });

  it("rotates variation by counter — consecutive same-comparison cues differ", () => {
    const a = splitCue(2, "5:30", "faster", 1);
    const b = splitCue(3, "5:30", "faster", 2);
    expect(a).not.toBe(b);
  });

  it("no comparison → plain distance + pace only", () => {
    expect(splitCue(1, "5:30", null, 0)).toBe(
      "1 kilometre. Pace 5:30 per kilometre."
    );
  });
});

describe("other cues", () => {
  it("time cue reads minutes + kilometres", () => {
    expect(timeCue(15, 2.8)).toBe("15 minutes in. 2.8 kilometres covered.");
  });

  it("pace alerts are direction-specific and vary by counter", () => {
    expect(paceAlertCue("behind", 0)).not.toBe(paceAlertCue("behind", 1));
    expect(paceAlertCue("ahead", 0).toLowerCase()).toContain("ahead");
  });

  it("halfway / final-500 / PB are non-empty and warm", () => {
    expect(halfwayCue(0).toLowerCase()).toContain("halfway");
    expect(final500Cue(0).toLowerCase()).toContain("five hundred");
    expect(pbCue("fastest 5K")).toContain("personal best for fastest 5K");
  });

  it("phase cues cover the interval lifecycle; unknown phase → null", () => {
    expect(phaseCue("warmup")).toContain("Warming up");
    expect(phaseCue("work", 2, 5)).toBe("Rep 2 of 5. Push on!");
    expect(phaseCue("rest")).toContain("Recovery");
    expect(phaseCue("cooldown")).toContain("Cooling down");
    expect(phaseCue("complete")).toContain("Session complete");
    expect(phaseCue("nonsense")).toBeNull();
  });
});
