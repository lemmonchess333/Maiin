/**
 * Tests for `buildCaption` — the structured caption shape used by
 * the Food hero card.
 *
 * The function has two independent axes (day type × activity bonus),
 * so the cases are the cross product. Pins both axes plus the rest-
 * day null short-circuit, which prevents the eyebrow from ever
 * appearing on a rest day (used to be a regression in F4 — see the
 * module's docstring for the cal-suffix history).
 */
import { describe, it, expect } from "vitest";
import { buildCaption } from "../captionBuilder";

describe("buildCaption — rest day short-circuit", () => {
  it("returns null on rest days regardless of activityBonus", () => {
    expect(buildCaption("rest", 0)).toBeNull();
    expect(buildCaption("rest", 150)).toBeNull();
    expect(buildCaption("rest", -50)).toBeNull();
  });
});

describe("buildCaption — training type axis", () => {
  it("lift → 'Lift day'", () => {
    expect(buildCaption("lift", 0)?.trainingType).toBe("Lift day");
  });

  it("run → 'Run day'", () => {
    expect(buildCaption("run", 0)?.trainingType).toBe("Run day");
  });

  it("both → 'Lift + Run'", () => {
    expect(buildCaption("both", 0)?.trainingType).toBe("Lift + Run");
  });
});

describe("buildCaption — adjustment axis", () => {
  it("positive bonus → '+N cal' suffix", () => {
    expect(buildCaption("lift", 150)?.adjustment).toBe("+150 cal");
    expect(buildCaption("run", 200)?.adjustment).toBe("+200 cal");
    expect(buildCaption("both", 50)?.adjustment).toBe("+50 cal");
  });

  it("zero bonus → empty adjustment", () => {
    expect(buildCaption("lift", 0)?.adjustment).toBe("");
  });

  it("negative bonus → empty adjustment (no minus shown)", () => {
    /* Linear-pace model only surfaces uplifts; deficits stay
       implicit so the eyebrow doesn't double up with the deficit
       indicator elsewhere on the Food card. */
    expect(buildCaption("lift", -100)?.adjustment).toBe("");
  });
});

describe("buildCaption — full shape integration", () => {
  it("returns the full DailyTargetsCaption on a lift day with bonus", () => {
    expect(buildCaption("lift", 150)).toEqual({
      trainingType: "Lift day",
      adjustment: "+150 cal",
    });
  });

  it("returns the full shape on a run day with no bonus", () => {
    expect(buildCaption("run", 0)).toEqual({
      trainingType: "Run day",
      adjustment: "",
    });
  });
});
