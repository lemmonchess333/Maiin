import { describe, expect, it } from "vitest";
import { planRunningAdaptation } from "../runningAdaptationPlanner";

type Input = Parameters<typeof planRunningAdaptation>[0];
function fixture(): Input {
  return {
    windowStart: "2026-11-09",
    review: { accountId: "fixture", revision: 1, symptoms: "none", capacity: { confirmed: true, afterEffectsReviewed: true, daysPerWeek: 2, longestMinutes: 25 }, restrictions: { status: "none" }, holds: [], raceGoalId: "race-unchanged" },
    current: [{ id: "one", date: "2026-11-09", templateId: "easy_40", protected: false }, { id: "two", date: "2026-11-11", templateId: "easy_30", protected: false }],
    selections: [{ sessionId: "one", maxMinutes: 25, format: { kind: "easy" } }],
  };
}
describe("disabled constrained adaptation planner", () => {
  it("selects a real fitting template, preserves identity and shows exact differences", () => {
    const input = fixture(); const before = structuredClone(input);
    const result = planRunningAdaptation(input);
    expect(result).toMatchObject({ status: "evaluated", proposed: [{ id: "one", date: "2026-11-09", templateId: "easy_20", minutes: 20, kind: "easy" }], preview: { status: "preview", removedIds: ["two"], longestMinutes: { before: 40, after: 20 }, raceGoalId: "race-unchanged", applyAvailable: false } });
    expect(input).toEqual(before);
  });
  it("never falls back to an oversized minimum", () => {
    const input = fixture(); input.selections[0].maxMinutes = 5;
    expect(planRunningAdaptation(input)).toMatchObject({ reason: "no_matching_template" });
  });
  it("intersects clinician, capacity and chosen limits", () => {
    const input = fixture(); input.review.restrictions = { status: "specified", source: "clinician", noRunning: false, maxMinutes: 15 };
    expect(planRunningAdaptation(input)).toMatchObject({ proposed: [{ templateId: "easy_10", minutes: 10 }] });
  });
  it("returns no candidate sessions when any independent hold blocks", () => {
    const input = fixture(); input.review.holds = ["injury"];
    expect(planRunningAdaptation(input)).toMatchObject({ status: "evaluated", proposed: [], preview: { reason: "running_paused" } });
  });
  it("never rewrites protected history", () => {
    const input = fixture(); input.current[1].protected = true;
    expect(planRunningAdaptation(input)).toMatchObject({ reason: "protected_history" });
  });
  it("rejects duplicate selection and nonexistent identities", () => {
    const input = fixture(); input.selections = [...input.selections, input.selections[0]];
    expect(planRunningAdaptation(input)).toMatchObject({ reason: "invalid_selection" });
    input.selections = [{ ...input.selections[0], sessionId: "unknown" }];
    expect(planRunningAdaptation(input)).toMatchObject({ reason: "invalid_selection" });
  });
  it("does not invent distance durations", () => {
    const input = fixture(); input.current[0].templateId = "long_10k";
    expect(planRunningAdaptation(input)).toMatchObject({ reason: "unsupported_template" });
  });
  it("bounds an actual distance template using confirmed pace", () => {
    const input = fixture(); input.current[0].templateId = "long_10k"; input.confirmedEasyPaceSecondsPerKm = 360;
    expect(planRunningAdaptation(input)).toMatchObject({ status: "evaluated", preview: { longestMinutes: { before: 60, after: 20 } } });
  });
  it("enforces fewer-days restriction instead of silently dropping chosen sessions", () => {
    const input = fixture(); input.review.restrictions = { status: "specified", source: "clinician", noRunning: false, maxDays: 1 };
    input.selections = [...input.selections, { sessionId: "two", maxMinutes: 20, format: { kind: "easy" } }];
    expect(planRunningAdaptation(input)).toMatchObject({ proposed: [], preview: { reason: "exceeds_limits" } });
  });
  it("uses explicit run/walk structure, not shortest total duration as stage choice", () => {
    const input = fixture(); input.review.capacity.longestMinutes = 30;
    input.selections = [{ sessionId: "one", maxMinutes: 30, format: { kind: "run_walk", templateId: "run_walk_1" } }];
    expect(planRunningAdaptation(input)).toMatchObject({ proposed: [{ templateId: "run_walk_1", minutes: 29 }] });
    input.selections[0].maxMinutes = 20;
    expect(planRunningAdaptation(input)).toMatchObject({ reason: "no_matching_template" });
  });
  it("cannot advance or convert an existing run/walk stage", () => {
    const input = fixture(); input.current[0].templateId = "run_walk_1";
    expect(planRunningAdaptation(input)).toMatchObject({ reason: "no_matching_template" });
    input.selections = [{ sessionId: "one", maxMinutes: 30, format: { kind: "run_walk", templateId: "run_walk_3" } }];
    expect(planRunningAdaptation(input)).toMatchObject({ reason: "no_matching_template" });
  });
  it.each(["2026-11-08", "2026-11-16", "2026-02-30"])("rejects out-of-window or malformed date %s", (date) => {
    const input = fixture(); input.current[0].date = date;
    expect(planRunningAdaptation(input)).toMatchObject({ reason: "invalid_selection" });
  });
});
