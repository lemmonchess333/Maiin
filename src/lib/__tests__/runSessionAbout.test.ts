/**
 * "Why this run", in four lines (Run21 (3)). This module owns three of
 * them: what the session is, how it should feel and what to do if it
 * feels wrong. The owner's complaint was that the plan "says easy, hard,
 * strides … and it's not explanatory what this actually is".
 */
import { describe, it, expect } from "vitest";
import { runSessionAbout } from "../runSessionAbout";
import { runSessionExplainer } from "../runSessionExplainer";
import { RUN_TEMPLATES } from "../workoutTemplates";

const about = (id: string) =>
  runSessionAbout(RUN_TEMPLATES.find((t) => t.id === id)!);

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
    expect(about("tempo_40").what).toMatch(/two blocks/);
    expect(about("easy_40_strides").what).toMatch(
      /4 strides: 20 seconds of quick, smooth running/
    );
  });

  it("says the last run-walk is one run, and the first has no week before it", () => {
    // Run-walk 6 is one 20-minute run between the walks (Run20 (5)).
    const last = about("run_walk_6");
    expect(last.what).toMatch(/^One easy run without stopping/);
    expect(last.what).not.toMatch(/walks between/);
    expect(last.feel).toMatch(/^Easy on the run: /);
    expect(about("run_walk_5").what).toMatch(/walks between/);
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
