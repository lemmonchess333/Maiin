/**
 * Tests for `matchTemplate` — the scoring + selection algorithm that
 * picks a workout template from the library based on the user's
 * profile. Sits on the program-generation hot path: every regenerate
 * call routes through here.
 *
 * What we pin:
 *   1. Hard filters — daysPerWeek + equipment must match exactly.
 *      A user who configures "5 days, home_gym" can't be served a
 *      4-day full_gym template (the silent-mismatch class).
 *   2. Score boosts in priority order — split, goal, experience,
 *      run integration. Pre-W1a this returned the best-available
 *      template without surfacing goal misses, so e.g. a strength
 *      user silently received a hypertrophy program. `isGoalMatch`
 *      must flag those cases.
 *   3. Tie-breaking is deterministic (first wins on equal score
 *      via sort stability).
 *   4. Fallback when no template clears the hard filters: prefer
 *      a full_body template, then templates[0]. `isGoalMatch` is
 *      always false on the fallback path so the caller can branch.
 *
 * Uses synthetic ProgramTemplate fixtures rather than the real
 * library so the assertions stay focused on the scoring rules,
 * not on whatever the canonical templates currently look like.
 */
import { describe, it, expect } from "vitest";
import { matchTemplate } from "../matchTemplate";
import type { ProgramTemplate } from "../templates";
import type { UserProfile } from "@/lib/auth";

function makeTemplate(overrides: Partial<ProgramTemplate> = {}): ProgramTemplate {
  return {
    id: "test-template",
    name: "Test Template",
    split: "full_body",
    daysPerWeek: 4,
    goal: "general",
    experience: ["intermediate"],
    equipment: "full_gym",
    gender: ["male", "female", "unspecified"],
    runIntegration: false,
    weeks: [],
    ...overrides,
  };
}

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  /* Minimal profile — `matchTemplate` only reads six fields. The
     cast is safe: the rest of UserProfile is never touched here. */
  return {
    daysPerWeek: 4,
    equipment: "full_gym",
    preferredSplit: "auto",
    primaryGoal: "general",
    experience: "intermediate",
    runFrequency: "none",
    ...overrides,
  } as UserProfile;
}

describe("matchTemplate — hard filters", () => {
  it("rejects templates with the wrong daysPerWeek", () => {
    const target = makeTemplate({ id: "match", daysPerWeek: 4 });
    const wrongDays = makeTemplate({ id: "wrong-days", daysPerWeek: 3 });
    const result = matchTemplate(makeProfile({ daysPerWeek: 4 }), [
      wrongDays,
      target,
    ]);
    expect(result.template.id).toBe("match");
  });

  it("rejects templates with the wrong equipment", () => {
    const target = makeTemplate({ id: "match", equipment: "home_gym" });
    const wrongEquip = makeTemplate({ id: "wrong-equip", equipment: "full_gym" });
    const result = matchTemplate(
      makeProfile({ equipment: "home_gym" }),
      [wrongEquip, target],
    );
    expect(result.template.id).toBe("match");
  });

  it("falls back when ALL templates fail the hard filters", () => {
    /* No 4-day template available → falls back. Fallback prefers
       full_body; both options here are upper_lower so it picks
       templates[0]. isGoalMatch must be false either way. */
    const t1 = makeTemplate({
      id: "t1",
      split: "upper_lower",
      daysPerWeek: 5,
    });
    const t2 = makeTemplate({
      id: "t2",
      split: "upper_lower",
      daysPerWeek: 6,
    });
    const result = matchTemplate(makeProfile({ daysPerWeek: 4 }), [t1, t2]);
    expect(result.template.id).toBe("t1");
    expect(result.isGoalMatch).toBe(false);
  });

  it("falls back to a full_body template when the daysPerWeek miss has one", () => {
    const upperLower = makeTemplate({
      id: "upper",
      split: "upper_lower",
      daysPerWeek: 5,
    });
    const fullBody = makeTemplate({
      id: "full-body",
      split: "full_body",
      daysPerWeek: 5,
    });
    const result = matchTemplate(
      makeProfile({ daysPerWeek: 4 }),
      [upperLower, fullBody],
    );
    expect(result.template.id).toBe("full-body");
    expect(result.isGoalMatch).toBe(false);
  });
});

describe("matchTemplate — score boosts", () => {
  it("prefers a goal-matching template over a non-matching one", () => {
    const strengthMatch = makeTemplate({ id: "strength", goal: "strength" });
    const hypertrophy = makeTemplate({ id: "hypertrophy", goal: "hypertrophy" });
    const result = matchTemplate(
      makeProfile({ primaryGoal: "strength" }),
      [hypertrophy, strengthMatch],
    );
    expect(result.template.id).toBe("strength");
    expect(result.isGoalMatch).toBe(true);
  });

  it("falls back to a non-goal template but reports isGoalMatch: false", () => {
    /* No strength template available — must surface the goal miss
       so the caller can choose to fall through to the procedural
       engine instead of silently giving the user a hypertrophy
       program. */
    const hypertrophy = makeTemplate({ id: "h", goal: "hypertrophy" });
    const result = matchTemplate(
      makeProfile({ primaryGoal: "strength" }),
      [hypertrophy],
    );
    expect(result.template.id).toBe("h");
    expect(result.isGoalMatch).toBe(false);
  });

  it("prefers a split-matching template when split is set", () => {
    const ppl = makeTemplate({ id: "ppl", split: "ppl" });
    const fullBody = makeTemplate({ id: "full", split: "full_body" });
    const result = matchTemplate(
      makeProfile({ preferredSplit: "ppl" }),
      [fullBody, ppl],
    );
    expect(result.template.id).toBe("ppl");
  });

  it("ignores split preference when set to 'auto'", () => {
    /* Auto means "we don't care which split" — neither template
       gets the +10 split boost. Goal match should win instead. */
    const fullBodyGeneral = makeTemplate({
      id: "full",
      split: "full_body",
      goal: "general",
    });
    const pplStrength = makeTemplate({
      id: "ppl",
      split: "ppl",
      goal: "strength",
    });
    const result = matchTemplate(
      makeProfile({ preferredSplit: "auto", primaryGoal: "strength" }),
      [fullBodyGeneral, pplStrength],
    );
    expect(result.template.id).toBe("ppl");
  });

  it("prefers an experience-matching template", () => {
    const beginner = makeTemplate({ id: "beg", experience: ["beginner"] });
    const intermediate = makeTemplate({
      id: "int",
      experience: ["intermediate"],
    });
    const result = matchTemplate(
      makeProfile({ experience: "intermediate" }),
      [beginner, intermediate],
    );
    expect(result.template.id).toBe("int");
  });

  it("matches experience arrays containing the user's level", () => {
    /* Some templates declare experience as a multi-level array
       (e.g. ["intermediate", "advanced"]). A user at either level
       should still get the experience boost. */
    const multi = makeTemplate({
      id: "multi",
      experience: ["intermediate", "advanced"],
    });
    const beginner = makeTemplate({ id: "beg", experience: ["beginner"] });
    const result = matchTemplate(
      makeProfile({ experience: "advanced" }),
      [beginner, multi],
    );
    expect(result.template.id).toBe("multi");
  });
});

describe("matchTemplate — run integration", () => {
  it("prefers run-integrated templates for regular runners", () => {
    const integrated = makeTemplate({ id: "run-int", runIntegration: true });
    const liftOnly = makeTemplate({ id: "lift-only", runIntegration: false });
    const result = matchTemplate(
      makeProfile({ runFrequency: "regular" }),
      [liftOnly, integrated],
    );
    expect(result.template.id).toBe("run-int");
  });

  it("prefers lift-only templates for users who don't run", () => {
    /* Inverse case — runFrequency: "none" gives a +2 boost to
       non-runIntegration templates. Smaller boost than the
       runners' +5 because "no runs" doesn't penalise a runner-
       friendly template as strongly. */
    const integrated = makeTemplate({ id: "run-int", runIntegration: true });
    const liftOnly = makeTemplate({ id: "lift-only", runIntegration: false });
    const result = matchTemplate(
      makeProfile({ runFrequency: "none" }),
      [integrated, liftOnly],
    );
    expect(result.template.id).toBe("lift-only");
  });
});

describe("matchTemplate — running primaryGoal special-case", () => {
  it("treats primaryGoal='running' as goal='general' for matching", () => {
    /* W1a contract: the 'running' primary goal is a stimulus type,
       not a lifting-template category. matchTemplate coerces it to
       'general' so runners still get a sensible lift template
       rather than missing every match. */
    const general = makeTemplate({ id: "gen", goal: "general" });
    const strength = makeTemplate({ id: "str", goal: "strength" });
    const result = matchTemplate(
      makeProfile({ primaryGoal: "running" }),
      [strength, general],
    );
    expect(result.template.id).toBe("gen");
    expect(result.isGoalMatch).toBe(true);
  });
});

describe("matchTemplate — profile defaults", () => {
  it("uses sensible defaults when profile fields are missing", () => {
    /* All optional profile fields undefined — matchTemplate should
       still produce a result via its built-in defaults (days=4,
       equipment=full_gym, split=auto, goal=general,
       experience=intermediate, runFreq=none). */
    const target = makeTemplate({
      id: "default-match",
      daysPerWeek: 4,
      equipment: "full_gym",
      goal: "general",
      experience: ["intermediate"],
    });
    const result = matchTemplate({} as UserProfile, [target]);
    expect(result.template.id).toBe("default-match");
    expect(result.isGoalMatch).toBe(true);
  });
});

describe("matchTemplate — empty input fallback", () => {
  it("falls back to templates[0] when only one template is provided and it fails the hard filters", () => {
    const wrongDays = makeTemplate({ id: "only", daysPerWeek: 6 });
    const result = matchTemplate(
      makeProfile({ daysPerWeek: 3 }),
      [wrongDays],
    );
    expect(result.template.id).toBe("only");
    expect(result.isGoalMatch).toBe(false);
  });
});
