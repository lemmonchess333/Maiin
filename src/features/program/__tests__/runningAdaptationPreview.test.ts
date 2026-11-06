import { describe, expect, it } from "vitest";
import { previewRunningAdaptation, type AdaptationReview } from "../runningAdaptationPreview";

function fixture(): AdaptationReview {
  return {
    accountId: "fixture-account", revision: 1, symptoms: "none",
    capacity: { confirmed: true, afterEffectsReviewed: true, daysPerWeek: 2, longestMinutes: 20 },
    restrictions: { status: "none" }, holds: [], raceGoalId: "unchanged-race",
    current: [
      { id: "a", date: "2026-11-09", minutes: 30, kind: "quality" },
      { id: "b", date: "2026-11-11", minutes: 40, kind: "long" },
      { id: "c", date: "2026-11-13", minutes: 20, kind: "easy" },
    ],
    proposed: [{ id: "a", date: "2026-11-09", minutes: 20, kind: "easy" }],
  };
}

describe("review-only running adaptation", () => {
  it("shows concrete changes without mutation, readiness or activation", () => {
    const input = fixture();
    const original = structuredClone(input);
    const result = previewRunningAdaptation(input);
    expect(result).toMatchObject({ status: "preview", days: { before: 3, after: 1 }, longestMinutes: { before: 40, after: 20 }, removedIds: ["b", "c"], changedIds: ["a"], raceGoalId: "unchanged-race", raceImpact: "review_required", applyAvailable: false });
    expect(input).toEqual(original);
    if (result.status === "preview") result.after[0].minutes = 999;
    expect(input).toEqual(original);
  });
  it.each(["injury", "post_race", "novice_readiness", "unknown_hold"])("never clears %s", (hold) => {
    const input = fixture(); input.holds = [hold];
    expect(previewRunningAdaptation(input)).toMatchObject({ reason: "running_paused" });
  });
  it.each(["daily_activities", "concerning", "unknown"] as const)("blocks %s symptoms", (symptoms) => {
    expect(previewRunningAdaptation({ ...fixture(), symptoms })).toMatchObject({ reason: "review_symptoms" });
  });
  it("requires explicit capacity and after-effects review", () => {
    const input = fixture(); input.capacity.confirmed = false;
    expect(previewRunningAdaptation(input)).toMatchObject({ reason: "review_capacity" });
    input.capacity.confirmed = true; input.capacity.afterEffectsReviewed = false;
    expect(previewRunningAdaptation(input)).toMatchObject({ reason: "review_capacity" });
  });
  it("does not equate guidance existing with representable restrictions", () => {
    const input = fixture(); input.symptoms = "during_or_after";
    expect(previewRunningAdaptation(input)).toMatchObject({ reason: "review_restrictions" });
    input.restrictions = { status: "specified", source: "clinician", noRunning: false };
    expect(previewRunningAdaptation(input)).toMatchObject({ reason: "review_restrictions" });
    input.restrictions.maxMinutes = 20;
    expect(previewRunningAdaptation(input)).toMatchObject({ status: "preview", applyAvailable: false });
  });
  it("uses the most restrictive capacity and clinician limit", () => {
    const input = fixture(); input.restrictions = { status: "specified", source: "clinician", noRunning: false, maxMinutes: 10 };
    expect(previewRunningAdaptation(input)).toMatchObject({ reason: "exceeds_limits" });
    input.restrictions.maxMinutes = 60; input.proposed[0].minutes = 25;
    expect(previewRunningAdaptation(input)).toMatchObject({ reason: "exceeds_limits" });
  });
  it("refuses no-running, unsupported and unknown restrictions", () => {
    const input = fixture();
    input.restrictions = { status: "specified", source: "clinician", noRunning: true };
    expect(previewRunningAdaptation(input)).toMatchObject({ reason: "running_paused" });
    input.restrictions = { status: "specified", source: "clinician", noRunning: false, unsupported: true };
    expect(previewRunningAdaptation(input)).toMatchObject({ reason: "review_restrictions" });
    input.restrictions = { status: "unknown" };
    expect(previewRunningAdaptation(input)).toMatchObject({ reason: "review_restrictions" });
  });
  it("does not reinterpret run/walk-only as easy continuous running", () => {
    const input = fixture(); input.restrictions = { status: "specified", source: "clinician", noRunning: false, runWalkOnly: true };
    expect(previewRunningAdaptation(input)).toMatchObject({ reason: "exceeds_limits" });
    input.proposed[0].kind = "run_walk";
    expect(previewRunningAdaptation(input).status).toBe("preview");
  });
  it.each(["added", "moved", "increased", "duplicate", "invalid_date", "long_window"])("refuses %s drafts", (change) => {
    const input = fixture();
    if (change === "added") input.proposed[0].id = "new";
    if (change === "moved") input.proposed[0].date = "2026-11-10";
    if (change === "increased") input.proposed[0].minutes = 35;
    if (change === "duplicate") input.proposed = [...input.proposed, { ...input.proposed[0] }];
    if (change === "invalid_date") input.proposed[0].date = "2026-02-30";
    if (change === "long_window") input.current[2].date = "2026-11-16";
    expect(previewRunningAdaptation(input)).toMatchObject({ reason: "invalid_draft" });
  });
  it("blocks invalid limits and missing account/revision", () => {
    const input = fixture(); input.restrictions = { status: "specified", source: "clinician", noRunning: false, maxMinutes: NaN };
    expect(previewRunningAdaptation(input)).toMatchObject({ reason: "review_restrictions" });
    expect(previewRunningAdaptation({ ...fixture(), accountId: "" })).toMatchObject({ reason: "invalid_draft" });
    expect(previewRunningAdaptation({ ...fixture(), revision: NaN })).toMatchObject({ reason: "invalid_draft" });
  });
});
