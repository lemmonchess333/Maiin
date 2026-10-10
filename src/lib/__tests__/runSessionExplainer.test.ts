/**
 * WAVE1-EXPLAIN — the "why this session" line.
 *
 * Two contracts: (1) every phase x type combination a plan can emit gets a
 * non-empty, register-compliant sentence; (2) missing plan context returns
 * null (freeform runs and extras show no line, never a wrong one). The
 * register ban list mirrors the codebase's standing rules: no readiness,
 * no physiology-measurement claims, no safety promises.
 */
import { describe, it, expect } from "vitest";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { getPhaseForWeek } from "@/features/program/runScheduler";
import {
  runSessionExplainer,
  runSessionPresentation,
} from "../runSessionExplainer";

const base = {
  currentWeek: 2,
  totalWeeks: 16,
  distance: "marathon" as const,
};
const build = { ...base, currentWeek: 9 };
const taper = { ...base, currentWeek: 13 };
const race = { ...base, currentWeek: 15 };

describe("runSessionExplainer", () => {
  it("returns null without plan context (freeform / extras / legacy)", () => {
    expect(
      runSessionExplainer({
        type: "easy",
        templateId: "easy_30",
        currentWeek: null,
        totalWeeks: null,
        distance: undefined,
      })
    ).toBeNull();
    expect(
      runSessionExplainer({
        type: "easy",
        templateId: "easy_30",
        currentWeek: 2,
        totalWeeks: 16,
        distance: undefined,
      })
    ).toBeNull();
  });

  it("covers every phase x type a plan can emit, non-empty", () => {
    const cases: Array<[string, string, typeof base]> = [
      ["easy", "easy_30", base],
      ["easy", "easy_30_strides", base],
      ["easy", "easy_90", build],
      ["easy", "easy_30", build],
      ["long", "long_12k", base],
      ["long", "long_25k", build],
      ["tempo", "tempo_30", build],
      ["intervals", "5x1k", build],
      ["easy", "easy_30", taper],
      ["intervals", "8x400", taper],
      ["long", "long_10k", taper],
      ["race", "marathon_race", race],
      ["easy", "easy_30", race],
    ];
    for (const [type, templateId, ctx] of cases) {
      const line = runSessionExplainer({ type, templateId, ...ctx });
      expect(line, `${type}/${templateId} @ wk${ctx.currentWeek}`).toBeTruthy();
      expect(line!.length).toBeGreaterThan(20);
    }
  });

  it("phase drives the copy: same template reads differently in build vs taper", () => {
    const inBuild = runSessionExplainer({
      type: "easy",
      templateId: "easy_30",
      ...build,
    });
    const inTaper = runSessionExplainer({
      type: "easy",
      templateId: "easy_30",
      ...taper,
    });
    expect(inBuild).not.toBe(inTaper);
    expect(inTaper).toMatch(/taper/i);
  });

  it("the medium-long and strides variants get their own sentences", () => {
    const mlr = runSessionExplainer({
      type: "easy",
      templateId: "easy_90",
      ...build,
    });
    const strides = runSessionExplainer({
      type: "easy",
      templateId: "easy_40_strides",
      ...build,
    });
    expect(mlr).toMatch(/medium-long/i);
    expect(strides).toMatch(/strides/i);
    expect(strides).toMatch(/not a hard session/i);
  });

  it("a run-walk says what it is, in every phase (Run20 (5))", () => {
    // A 5K six weeks out is all run-walk, its taper and race week too, and
    // there a run-walk was "Taper — easy and short on purpose" and a
    // "Race-week shakeout".
    for (const ctx of [base, build, taper, race]) {
      const line = runSessionExplainer({
        type: "easy",
        templateId: "run_walk_2",
        ...ctx,
      });
      expect(line).toMatch(/^Run-walk/);
      expect(line).toMatch(/walks are part of the method/);
      expect(line).not.toMatch(/readiness|safe|VO2/i);
    }
  });

  it("the last run-walk is the one the weeks before built to, with no walks between", () => {
    // Run-walk 6 is a walk, 20 minutes of running and a walk (review of
    // #2655). What it is, "Why this run" says in its own line (Run21 (3)),
    // so this is the reason only.
    for (const ctx of [base, build, taper, race]) {
      const line = runSessionExplainer({
        type: "easy",
        templateId: "run_walk_6",
        ...ctx,
      });
      expect(line).toMatch(/^The last run-walk — what the weeks before/);
      expect(line).not.toMatch(/walks between/);
    }
  });

  it("REGISTER: never claims readiness, physiology measurement, or safety", () => {
    const all: string[] = [];
    for (const type of ["easy", "long", "tempo", "intervals", "race"]) {
      for (const ctx of [base, build, taper, race]) {
        const line = runSessionExplainer({ type, templateId: "x", ...ctx });
        if (line) all.push(line);
      }
    }
    for (const line of all) {
      expect(line).not.toMatch(/readiness|recovery score|safe(ly|ty)?\b/i);
      expect(line).not.toMatch(/VO2|lactate|MRV/i);
    }
  });
});

describe("shared run purpose presentation", () => {
  it.each([0, 2, 9, 13, 15])(
    "preserves the Manage explanation and engine phase at week %s",
    (currentWeek) => {
      const input = {
        ...base,
        currentWeek,
        type: "easy",
        templateId: "easy_30",
      };
      const result = runSessionPresentation(input);
      expect(result.purpose).toBe(runSessionExplainer(input));
      const phase = getPhaseForWeek(
        currentWeek,
        base.totalWeeks,
        base.distance
      );
      expect(result.weekLabel).toBe(
        `${phase[0].toUpperCase() + phase.slice(1)} · week ${currentWeek + 1} of 16`
      );
    }
  );
  it.each([-1, 16, NaN, Infinity, 1.5])(
    "does not invent a phase for invalid week %s",
    (currentWeek) => {
      expect(
        runSessionPresentation({
          ...base,
          currentWeek,
          type: "easy",
          templateId: "easy_30",
        })
      ).toEqual({ purpose: null, weekLabel: null });
    }
  );
  it("omits unsupported race distances", () => {
    expect(
      runSessionPresentation({
        ...base,
        distance: "ultra",
        type: "easy",
        templateId: "easy_30",
      }).purpose
    ).toBeNull();
  });
});

describe("a long run that finishes at race pace (Run21 (2))", () => {
  // Half plan, 10 weeks: base w0-2, build w3-6.
  const long = {
    type: "long",
    templateId: "long_15k",
    totalWeeks: 10,
    distance: "half",
  };

  it("is in the build's week to rehearse race day", () => {
    expect(
      runSessionExplainer({ ...long, currentWeek: 5, racePace: "finish" })
    ).toBe(
      "It rehearses race day on tired legs: your pace, your fuelling and your focus."
    );
  });

  it("keeps the anchor run's reason without one", () => {
    expect(runSessionExplainer({ ...long, currentWeek: 5 })).toMatch(
      /^The week's anchor run/
    );
  });
});

describe("a tempo at the goal race pace (Run21 (3))", () => {
  // Half, 10 weeks: base w0-2, build w3-6, taper w7-8. The plain tempo's
  // reason says its pace "comes from your fitness", which a goal-pace
  // tempo's doesn't, and the taper's says "easy and short".
  const tempo = {
    type: "tempo",
    templateId: "tempo_20",
    totalWeeks: 10,
    distance: "half",
  };

  it("practises the goal pace in the build", () => {
    const why = runSessionExplainer({
      ...tempo,
      currentWeek: 5,
      racePace: "tempo",
    });
    expect(why).toBe(
      "It teaches your legs and breathing what race pace feels like, so the goal pace is familiar when it counts."
    );
  });

  it("keeps the rhythm sharp in the taper", () => {
    expect(
      runSessionExplainer({ ...tempo, currentWeek: 7, racePace: "tempo" })
    ).toBe(
      "Taper — a short block at race pace keeps the rhythm sharp while the volume drops."
    );
  });

  it("keeps the tempo's own reasons without it", () => {
    expect(runSessionExplainer({ ...tempo, currentWeek: 5 })).toMatch(
      /^Tempo — /
    );
  });
});

describe("physiology words stay out of the reasons (Run21 (2))", () => {
  // They appear only as "Coaches also call this" (runSessionAbout).
  it("gives no reason that names one, in any week", () => {
    for (const t of RUN_TEMPLATES) {
      for (let week = 0; week < 16; week++) {
        for (const racePace of [null, "finish", "tempo"] as const) {
          const why = runSessionExplainer({
            type: t.type,
            templateId: t.id,
            currentWeek: week,
            totalWeeks: 16,
            distance: "marathon",
            racePace,
          });
          expect(why ?? "", `${t.id}, week ${week + 1}`).not.toMatch(
            /aerobic|threshold|economy|VO2|lactate/i
          );
        }
      }
    }
  });
});
