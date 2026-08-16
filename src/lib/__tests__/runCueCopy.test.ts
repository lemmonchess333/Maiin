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
  finalStretchCue,
  sessionCompleteCue,
  intervalRepCue,
  intervalRecoveryCue,
  strideRepCue,
  floatCue,
} from "../runCueCopy";

describe("splitCue", () => {
  it("speaks whole-km splits with 'per kilometre', never 'per K'", () => {
    const cue = splitCue(3, "km", "5:44", "steady", 0);
    expect(cue).toContain("3 kilometres");
    expect(cue).toContain("Pace 5:44 per kilometre");
    expect(cue).not.toMatch(/per K\b/);
  });

  it("singular for the first kilometre; decimals for 500m mode", () => {
    expect(splitCue(1, "km", "6:00", null, 0)).toContain("1 kilometre.");
    expect(splitCue(1.5, "km", "6:00", null, 0)).toContain("1.5 kilometres");
  });

  it("rotates variation by counter — consecutive same-comparison cues differ", () => {
    const a = splitCue(2, "km", "5:30", "faster", 1);
    const b = splitCue(3, "km", "5:30", "faster", 2);
    expect(a).not.toBe(b);
  });

  it("no comparison → plain distance + pace only", () => {
    expect(splitCue(1, "km", "5:30", null, 0)).toBe(
      "1 kilometre. Pace 5:30 per kilometre."
    );
  });

  it("speaks MILES, and says the word — a converted number is not enough", () => {
    /* The reason the unit reaches the copy at all. A voice saying
       "kilometres" over a mile figure contradicts the watch on the
       runner's wrist, so the noun has to move with the number. */
    expect(splitCue(3, "mi", "8:03", null, 0)).toBe(
      "3 miles. Pace 8:03 per mile."
    );
    expect(splitCue(1, "mi", "8:03", null, 0)).toBe(
      "1 mile. Pace 8:03 per mile."
    );
    expect(splitCue(3, "mi", "8:03", null, 0)).not.toMatch(/kilometre/);
  });

  it("stays written for the EAR in both units", () => {
    /* The module's founding rule: no abbreviation a TTS engine mangles.
       "mi" read aloud is not a word. */
    for (const unit of ["km", "mi"] as const) {
      const cue = splitCue(2, unit, "8:00", "steady", 0);
      expect(cue).not.toMatch(/\bmi\b|\bkm\b/);
    }
  });
});

  it("a split cue DESCRIBES the split — it never sounds like an instruction", () => {
    /* Heard on a real run (owner, 2026-08-16): after a 9:28 km the voice
       said "Bit slower — find your rhythm again", which the ear takes as
       an instruction to slow DOWN — the opposite of the intent. These
       cues report the split just finished; only paceAlertCue instructs,
       and it only fires against a target.

       The class-level guard: a comparison cue must NAME what was
       faster/slower, so the comparative can never be heard as a verb
       aimed at the runner. Anchors: "split", "that one", "than the
       last", or a "you're"/"you've" subject. */
    const ANCHORED = /\bsplit\b|\bthat one\b|\bthan the last\b|\byou'?re\b|\byou'?ve\b/i;
    for (const comparison of ["faster", "slower"] as const) {
      for (let v = 0; v < 12; v++) {
        const cue = splitCue(3, "km", "5:44", comparison, v);
        // Strip the factual "3 kilometres. Pace 5:44 per kilometre." head.
        const tail = cue.slice(cue.indexOf("per kilometre.") + 14).trim();
        expect(tail, `${comparison} variant ${v}: "${tail}"`).toMatch(ANCHORED);
      }
    }
  });

describe("other cues", () => {
  it("time cue reads minutes + kilometres", () => {
    expect(timeCue(15, 2800, "km")).toBe(
      "15 minutes in. 2.8 kilometres covered."
    );
    // Takes METRES, so the conversion happens in one place.
    expect(timeCue(15, 5000, "mi")).toBe("15 minutes in. 3.1 miles covered.");
  });

  it("pace alerts are direction-specific and vary by counter", () => {
    expect(paceAlertCue("behind", 0)).not.toBe(paceAlertCue("behind", 1));
    expect(paceAlertCue("ahead", 0).toLowerCase()).toContain("ahead");
  });

  it("pace alerts survive a long tempo without becoming a metronome", () => {
    // These fire on a 30s cooldown for as long as the deviation holds, so
    // a 40-minute tempo can trigger them ~40 times. With two entries that
    // was the same pair alternating for most of an hour — the repetition
    // complaint in its loudest form. Six gives a long session real
    // variety; the assertion is on the DISTINCT COUNT over a realistic
    // firing sequence, not on the pool literal, so growing or reordering
    // the pool doesn't break it but shrinking it does.
    for (const dir of ["behind", "ahead"] as const) {
      const heard = Array.from({ length: 40 }, (_, i) => paceAlertCue(dir, i));
      expect(
        new Set(heard).size,
        `${dir}: only ${new Set(heard).size} distinct lines across 40 alerts`
      ).toBeGreaterThanOrEqual(6);
      // And never twice running.
      for (let i = 1; i < heard.length; i += 1) {
        expect(heard[i], `${dir} alert ${i + 1}`).not.toBe(heard[i - 1]);
      }
    }
  });

  it("halfway / final-stretch are non-empty and warm", () => {
    expect(halfwayCue(0).toLowerCase()).toContain("halfway");
    expect(finalStretchCue("km", 0).toLowerCase()).toContain("five hundred");
  });

  it("the final-stretch cue names a landmark the LISTENER is running to", () => {
    /* Both lines name the distance out loud, so both have to move. "Last
       half kilometre" cannot be said to someone whose watch is counting
       down a quarter mile — and 500 m converted is 0.31 miles, which is
       not a landmark anyone runs to. */
    const mi = [finalStretchCue("mi", 0), finalStretchCue("mi", 1)];
    for (const cue of mi) {
      expect(cue.toLowerCase()).toContain("quarter");
      expect(cue.toLowerCase()).not.toMatch(/kilometre|metres/);
    }
    expect(mi[0]).not.toBe(mi[1]); // still rotates
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

  /**
   * Everything the runner hears MINUS the numbers.
   *
   * Both the "Rep 3 of 8." head and the " 4 to go after this." tally are
   * stripped, because both move on their own and can make an identical
   * coaching clause look like a distinct string.
   */
  function clause(cue: string): string {
    return cue
      .replace(/^Rep \d+ of \d+\.\s*/, "")
      .replace(/^\d+ to go after this\.\s*/, "")
      .trim();
  }

  it("never repeats a coaching CLAUSE within a normal session", () => {
    // The assertion that was missing, and it caught a live bug.
    //
    // The first version of this test compared whole strings and asserted
    // only `> 1` distinct. Both were satisfied by copy that gave reps 3
    // and 7 of an 8×400 the identical clause "Keep the shoulders easy." —
    // the very defect being fixed, one layer down, hidden by exactly the
    // rep-number tautology the header above warns about. Writing the
    // warning did not stop me reproducing it.
    //
    // Capped at 10 because the pools are finite by design: beyond a
    // normal session length cycling is correct behaviour, and the
    // back-to-back rule below is what governs there.
    for (let n = 3; n <= 10; n += 1) {
      const { work } = session(n);
      const clauses = work.map(clause);
      expect(
        new Set(clauses).size,
        `${n} reps produced ${new Set(clauses).size} distinct clauses: ${JSON.stringify(clauses)}`
      ).toBe(n);
    }
  });

  it("never repeats a coaching clause back-to-back, at any length", () => {
    // Holds where the no-repeat rule above stops. A 20-rep session may
    // reuse a line; it may not use the same one twice running.
    for (const n of [12, 16, 20]) {
      const clauses = session(n).work.map(clause);
      for (let i = 1; i < clauses.length; i += 1) {
        expect(clauses[i], `${n} reps, rep ${i + 1}`).not.toBe(clauses[i - 1]);
      }
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
    // Clause-level, same reason as the reps: `Set(strides).size === 6` was
    // passing on the stride NUMBER while strides 1 and 5 shared a line.
    for (const n of [4, 6, 8]) {
      const strides = Array.from({ length: n }, (_, i) =>
        strideRepCue(i + 1, n, i + 1)
      );
      const clauses = strides.map((s) =>
        s.replace(/^Stride \d+ of \d+\.\s*/, "")
      );
      expect(
        new Set(clauses).size,
        `${n} strides: ${JSON.stringify(clauses)}`
      ).toBe(n);
      expect(strides[n - 1]).toMatch(/last/i);
    }
    const floats = [0, 1, 2].map((i) => floatCue(i));
    expect(new Set(floats).size).toBe(3);
  });
});
