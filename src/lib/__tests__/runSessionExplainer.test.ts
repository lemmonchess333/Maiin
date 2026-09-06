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
import { runSessionExplainer } from "../runSessionExplainer";

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
