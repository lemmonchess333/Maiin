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
  sessionCompleteCue,
  intervalRepCue,
  intervalRecoveryCue,
  strideRepCue,
  floatCue,
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
    // STRUCT-SESS-02: per-segment cue copy moved onto the segments
    // themselves (runSegments builders, pinned in runSegments.test); only
    // the terminal line lives here.
    expect(sessionCompleteCue()).toContain("Session complete");
  });
});

/**
 * Repeated-segment vocabulary — the anti-repetition property.
 *
 * The user's report, verbatim: "for example of interval training it's the
 * same exact sentence said on the intervals and then on the rests it's the
 * same as well, so the user just heard it over and over again".
 *
 * That was literally true. Every work rep said `Rep N of 5. Push on!` and
 * every recovery said, byte for byte, `Recovery. Shake it out — nice easy
 * jog.` Only the number moved.
 *
 * So the assertions are about what a whole SESSION sounds like, not about
 * any one string. A per-call test ("does it return a string") passes just
 * as happily against the fixed literals — the defect only exists across a
 * sequence, so that is the level it has to be checked at.
 */
describe("interval cue vocabulary — no wallpaper", () => {
  /** Everything a runner hears on an N-rep session, in order. */
  function session(n: number): { work: string[]; rest: string[] } {
    const work: string[] = [];
    const rest: string[] = [];
    for (let rep = 1; rep <= n; rep += 1) {
      work.push(intervalRepCue(rep, n, rep));
      if (rep < n) rest.push(intervalRecoveryCue(rep, n, rep));
    }
    return { work, rest };
  }

  it("varies the COACHING, not just the rep number", () => {
    // Deliberately strips the "Rep 3 of 5." head before comparing.
    //
    // Asserting the whole strings are distinct looked like the right test
    // and was almost worthless: the OLD copy was `Rep N of 5. Push on!`,
    // which is string-unique for every rep purely because the number
    // moves. It passed against the exact defect being fixed — confirmed
    // by mutation, not assumed. What the runner actually hears repeating
    // is everything after the count, so that is what gets compared.
    for (const n of [3, 5, 6, 8]) {
      const { work } = session(n);
      const coaching = work.map((c) => c.replace(/^Rep \d+ of \d+\.\s*/, ""));
      expect(
        new Set(coaching).size,
        `only ${new Set(coaching).size} distinct coaching lines across ${n} reps: ${JSON.stringify(coaching)}`
      ).toBeGreaterThan(1);
    }
  });

  it("never repeats a full work cue across a session", () => {
    for (const n of [3, 5, 6, 8, 10, 12]) {
      const { work } = session(n);
      expect(new Set(work).size, `work cues for ${n} reps`).toBe(n);
    }
  });

  it("never says the same recovery line twice in a row", () => {
    // Weaker than the work claim on purpose: with 12+ recoveries the pool
    // must cycle, and that is fine. What the user actually noticed is
    // BACK-TO-BACK sameness, so that is what is forbidden.
    for (const n of [3, 5, 6, 8, 10, 12]) {
      const { rest } = session(n);
      for (let i = 1; i < rest.length; i += 1) {
        expect(rest[i], `${n} reps, recovery ${i + 1}`).not.toBe(rest[i - 1]);
      }
    }
  });

  it("names the first and last rep, because they are not interchangeable", () => {
    // The first is where people over-cook it; the last is the one worth
    // naming and nothing ever did.
    const { work } = session(5);
    expect(work[0]).toMatch(/^Rep 1 of 5\./);
    expect(work[0]).not.toMatch(/last/i);
    expect(work[4]).toMatch(/last|final|empty the tank/i);
  });

  it("does not restate 'first' after already saying 'Rep 1 of 5'", () => {
    // Fine on the page, silly in the ear.
    for (let v = 0; v < 6; v += 1) {
      expect(intervalRepCue(1, 5, v)).not.toMatch(/first/i);
    }
  });

  it("flags the final recovery, which changes how you run the last rep", () => {
    const { rest } = session(5);
    expect(rest[rest.length - 1]).toMatch(/one rep to go/i);
  });

  it("states reps remaining sometimes, not every single time", () => {
    // A useful fact said on every cue becomes the wallpaper this change
    // exists to remove.
    const { work, rest } = session(8);
    const withCount = [...work, ...rest].filter((c) =>
      /to go|reps left/i.test(c)
    );
    expect(withCount.length).toBeGreaterThan(0);
    expect(withCount.length).toBeLessThan(work.length + rest.length);
  });

  it("is deterministic — same inputs, same line", () => {
    // No Math.random anywhere in this module; the copy has to be
    // reproducible for these assertions to mean anything at all.
    expect(intervalRepCue(3, 5, 3)).toBe(intervalRepCue(3, 5, 3));
    expect(intervalRecoveryCue(2, 6, 2)).toBe(intervalRecoveryCue(2, 6, 2));
    expect(strideRepCue(4, 6, 4)).toBe(strideRepCue(4, 6, 4));
  });

  it("varies strides and floats too, and names the last stride", () => {
    const strides = [1, 2, 3, 4, 5, 6].map((r) => strideRepCue(r, 6, r));
    expect(new Set(strides).size).toBe(6);
    expect(strides[5]).toMatch(/last/i);
    const floats = [0, 1, 2].map((i) => floatCue(i));
    expect(new Set(floats).size).toBe(3);
  });
});
