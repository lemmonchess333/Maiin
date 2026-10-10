/**
 * "Why this run", in four lines (Run21 (3)). This module owns three of
 * them: what the session is, how it should feel and what to do if it
 * feels wrong. The owner's complaint was that the plan "says easy, hard,
 * strides … and it's not explanatory what this actually is".
 */
import { describe, it, expect } from "vitest";
import { runSessionAbout, runSessionName } from "../runSessionAbout";
import { runSessionExplainer } from "../runSessionExplainer";
import { RUN_TEMPLATES } from "../workoutTemplates";

const about = (id: string) =>
  runSessionAbout(RUN_TEMPLATES.find((t) => t.id === id)!);

/** A long run's race-pace finish, as `racePaceWorkFor` gives one. */
const FINISH = { kind: "finish" as const, blockKm: 5, goalPaceS: 300 };
/** A tempo at the goal pace, as `racePaceWorkFor` gives one. */
const TEMPO = { kind: "tempo" as const, goalPaceS: 300 };

describe("runSessionAbout", () => {
  it("says what every session is, how it should feel, and what to do", () => {
    for (const t of RUN_TEMPLATES) {
      const lines = runSessionAbout(t);
      for (const line of [lines.what, lines.feel, lines.ifWrong]) {
        expect(line, t.id).toMatch(/^[A-Z].*[.]$/);
        // The explainer's register: no physiology, readiness or safety.
        expect(line, t.id).not.toMatch(
          /VO2|lactate|threshold|aerobic|readiness|safe/i
        );
      }
    }
  });

  it("leads the feel line with the run's effort word", () => {
    expect(about("easy_30").feel).toMatch(/^Easy: you can talk/);
    expect(about("easy_60").feel).toMatch(/^Easy: /);
    expect(about("long_15k").feel).toMatch(/^Easy, like your easy days/);
    expect(about("run_walk_1").feel).toMatch(/^Easy on the runs/);
    expect(about("tempo_20").feel).toMatch(/^Comfortably hard: a few words/);
    expect(about("4x1k").feel).toMatch(/^Hard, and even/);
    expect(about("8x400").feel).toMatch(/^Quick and relaxed/);
    expect(about("easy_40_strides").feel).toMatch(
      /^Easy, then quick and relaxed/
    );
  });

  it("gives a race the effort of its distance", () => {
    expect(about("5k_race").feel).toBe(about("10k_race").feel);
    expect(about("half_race").feel).toBe(about("marathon_race").feel);
    expect(about("5k_race").feel).not.toBe(about("marathon_race").feel);
    expect(about("marathon_race").feel).toMatch(/^Start steady/);
  });

  it("tells each kind of session apart", () => {
    const kinds = [
      "easy_30",
      "easy_30_strides",
      "easy_75",
      "long_10k",
      "run_walk_3",
      "tempo_20",
      "tempo_40",
      "5x1k",
      "8x400",
      "half_race",
    ].map((id) => about(id).what);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(about("tempo_40").what).toMatch(/two 20-minute blocks/);
    expect(about("easy_40_strides").what).toMatch(
      /4 strides: 20 seconds of quick, smooth running/
    );
  });

  it("says the last run-walk is one run, and the first has no week before it", () => {
    // Run-walk 6 is one 20-minute run between the walks (Run20 (5)).
    const last = about("run_walk_6");
    expect(last.what).toBe(
      "A 5-minute walk, then 20 minutes of easy running without a break, then a walk to finish."
    );
    expect(last.what).not.toMatch(/walks between/);
    expect(last.feel).toMatch(/^Easy on the run: /);
    expect(about("run_walk_5").what).toMatch(
      /easy runs of 10 minutes and 8 minutes with a 2-minute walk between/
    );
    // Run-walk 1 is the first week's: there is no last week's to swap in.
    expect(about("run_walk_1").ifWrong).not.toMatch(/last week/);
    expect(about("run_walk_1").ifWrong).toMatch(/start the walk early/);
    expect(last.ifWrong).toMatch(/last week's session/);
  });

  it("says each thing once: the plan's reason repeats none of the other lines", () => {
    // The four lines sit together (RunAbout), so a reason that restates the
    // session or its pacing says nothing new: Run-walk 6's read "One easy
    // run without stopping…" twice, and race day's said where the plan was
    // building, and to start carefully, twice each.
    const phrases = (line: string) => {
      const words = line
        .toLowerCase()
        .replace(/[^a-z0-9' ]+/g, " ")
        .split(/\s+/)
        .filter(Boolean);
      return new Set(
        words.slice(2).map((_, i) => words.slice(i, i + 3).join(" "))
      );
    };
    for (const t of RUN_TEMPLATES) {
      const lines = runSessionAbout(t);
      for (const currentWeek of [2, 9, 13, 15]) {
        const why = runSessionExplainer({
          type: t.type,
          templateId: t.id,
          currentWeek,
          totalWeeks: 16,
          distance: "marathon",
        });
        if (!why) continue;
        for (const line of [lines.what, lines.feel, lines.ifWrong]) {
          const shared = [...phrases(why)].filter((p) => phrases(line).has(p));
          expect(shared, `${t.id}, week ${currentWeek + 1}`).toEqual([]);
        }
      }
    }
    // A long run that finishes at race pace has lines and a reason of its
    // own (Run21 (2)), in the build.
    for (const t of RUN_TEMPLATES.filter((x) => x.type === "long")) {
      const lines = runSessionAbout(t, { racePace: FINISH });
      const why = runSessionExplainer({
        type: t.type,
        templateId: t.id,
        currentWeek: 9,
        totalWeeks: 16,
        distance: "marathon",
        racePace: "finish",
      });
      expect(why, t.id).toMatch(/rehearses race day/);
      for (const line of [lines.what, lines.feel, lines.ifWrong]) {
        const shared = [...phrases(why!)].filter((p) => phrases(line).has(p));
        expect(shared, `${t.id} with race pace`).toEqual([]);
      }
    }
    // So has a tempo at the goal pace, in the build and in the taper.
    for (const t of RUN_TEMPLATES.filter((x) => x.type === "tempo")) {
      const lines = runSessionAbout(t, { racePace: TEMPO });
      for (const currentWeek of [9, 13]) {
        const why = runSessionExplainer({
          type: t.type,
          templateId: t.id,
          currentWeek,
          totalWeeks: 16,
          distance: "marathon",
          racePace: "tempo",
        });
        expect(why, `${t.id}, week ${currentWeek + 1}`).toMatch(/race pace/);
        for (const line of [lines.what, lines.feel, lines.ifWrong]) {
          const shared = [...phrases(why!)].filter((p) => phrases(line).has(p));
          expect(
            shared,
            `${t.id} at race pace, week ${currentWeek + 1}`
          ).toEqual([]);
        }
      }
    }
  });

  it("offers a way through when it feels wrong, not a verdict", () => {
    expect(about("easy_30").ifWrong).toMatch(/walk for a minute/);
    expect(about("4x1k").ifWrong).toMatch(/One fewer rep is still the session/);
    expect(about("run_walk_2").ifWrong).toMatch(/last week's session/);
    for (const t of RUN_TEMPLATES) {
      expect(runSessionAbout(t).ifWrong, t.id).not.toMatch(
        /fail|bad|should have/i
      );
    }
  });
});

describe("a long run that finishes at race pace (Run21 (2))", () => {
  // Appendix B: "A long run with a section at goal race pace near the end."
  // Its plain lines said "Easy, like your easy days" and "Finishing
  // comfortably matters more than the pace", which the finish contradicts.
  const long15 = RUN_TEMPLATES.find((t) => t.id === "long_15k")!;

  it("says what it is, how it should feel and what to do if race pace won't come", () => {
    const lines = runSessionAbout(long15, { racePace: FINISH });
    expect(lines.what).toBe(
      "Your longest run of the week, finishing at your goal race pace."
    );
    expect(lines.feel).toMatch(/^Easy until the final stretch/);
    expect(lines.ifWrong).toMatch(/Run the rest easy/);
    for (const line of [lines.what, lines.feel, lines.ifWrong]) {
      expect(line).not.toMatch(/like your easy days|comfortably matters/);
    }
  });

  it("keeps the plain long run's lines without one", () => {
    const lines = runSessionAbout(long15, { racePace: null });
    expect(lines.what).toBe("Your longest run of the week.");
    expect(lines.feel).toMatch(/^Easy, like your easy days/);
  });

  it("is named for it: Appendix B's 'Long run with race pace'", () => {
    expect(runSessionName(long15, FINISH)).toBe("Long 15K with race pace");
    expect(runSessionName(long15, null)).toBe("Long 15K");
    expect(runSessionName(undefined, null)).toBe("Run");
    expect(runSessionName(undefined, null, "Free run")).toBe("Free run");
  });
});

describe("a tempo at the goal race pace (Run21 (2), Run21 (3))", () => {
  // A2 runs a half or marathon plan's tempos at the goal pace through the
  // build and taper. Their lines called them comfortably hard, at a pace
  // "from your fitness".
  const tempo = (id: string) => RUN_TEMPLATES.find((t) => t.id === id)!;

  it("says it runs at your goal race pace, in one block or two", () => {
    const one = runSessionAbout(tempo("tempo_20"), { racePace: TEMPO });
    expect(one.what).toBe(
      "A 5-minute warm-up, 20 minutes at your goal race pace, then a 5-minute cool-down."
    );
    expect(one.feel).toMatch(/^Race pace: even and controlled/);
    expect(one.ifWrong).toMatch(/change your goal time/);
    const two = runSessionAbout(tempo("tempo_40"), { racePace: TEMPO });
    expect(two.what).toMatch(/two 20-minute blocks at your goal race pace/);
    for (const line of [one.what, one.feel, two.what]) {
      expect(line).not.toMatch(/comfortably hard/i);
    }
  });

  it("keeps the tempo's own lines without it", () => {
    expect(runSessionAbout(tempo("tempo_20")).feel).toMatch(
      /^Comfortably hard/
    );
  });

  it("is named for it", () => {
    expect(runSessionName(tempo("tempo_20"), TEMPO)).toBe(
      "20 Min Tempo at race pace"
    );
  });
});

describe("each session's shape, and the name coaches give it (Run21 (2))", () => {
  // The card's line is the feel line, so "What it is" carries the shape the
  // template's description gave: a tempo's minutes, the repeats and their
  // rest, a run-walk's pattern.
  it("gives a tempo, intervals and run-walk their shape from the template", () => {
    expect(about("tempo_20").what).toBe(
      "A 5-minute warm-up, 20 minutes comfortably hard, then a 5-minute cool-down."
    );
    expect(about("4x1k").what).toBe(
      "A 5-minute warm-up, then 4 repeats of 1K, hard, with 90 seconds of easy jogging or walking between, then a 5-minute cool-down."
    );
    expect(about("8x400").what).toMatch(
      /8 repeats of 400 m, quick and relaxed, with 1 minute of easy jogging/
    );
    expect(about("run_walk_1").what).toBe(
      "A 5-minute walk, then 8 easy runs of 1 minute with 90-second walks between, then a walk to finish."
    );
    expect(about("run_walk_4").what).toMatch(
      /3 easy runs of 5 minutes with 2½-minute walks between/
    );
  });

  it("names a session's physiology only as 'Coaches also call this'", () => {
    expect(about("easy_30").alsoCalled).toBe("Zone 2, or aerobic running.");
    expect(about("easy_75").alsoCalled).toBe("Zone 2, or aerobic running.");
    expect(about("long_15k").alsoCalled).toBe("Zone 2, or aerobic running.");
    expect(about("tempo_20").alsoCalled).toBe("A threshold run.");
    expect(about("5x1k").alsoCalled).toBe("VO2 max intervals.");
    // None where coaches have no physiology name for it.
    for (const id of ["easy_30_strides", "8x400", "run_walk_2", "half_race"]) {
      expect(about(id).alsoCalled, id).toBeUndefined();
    }
    const find = (id: string) => RUN_TEMPLATES.find((t) => t.id === id)!;
    expect(
      runSessionAbout(find("tempo_20"), { racePace: TEMPO }).alsoCalled
    ).toBeUndefined();
    expect(
      runSessionAbout(find("long_15k"), { racePace: FINISH }).alsoCalled
    ).toBeUndefined();
  });

  it("keeps physiology words out of the other lines", () => {
    for (const t of RUN_TEMPLATES) {
      for (const racePace of [null, FINISH, TEMPO]) {
        const { what, feel, ifWrong } = runSessionAbout(t, { racePace });
        for (const line of [what, feel, ifWrong]) {
          expect(line, t.id).not.toMatch(
            /aerobic|threshold|economy|VO2|lactate|zone/i
          );
        }
      }
    }
  });
});
