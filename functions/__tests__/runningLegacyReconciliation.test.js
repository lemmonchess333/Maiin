import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { reconcileLegacyRunning: map } = require("../lib/runningLegacyReconciliation");
describe("legacy safety fact mapping", () => {
  it("maps supported retired prescriptions without inferring capacity or copying sessions", () => {
    const legacy = { runPlan: { mode: "starter", stage: 3 }, runDays: [{ id: "old", templateId: "easy_20", type: "easy", completed: true }], workouts: [] };
    const copy = structuredClone(legacy); const value = map(legacy);
    expect(value.holds).toEqual([]); expect(value.evidence).toContain("legacy_prescriptions_retired");
    expect(value).not.toHaveProperty("sessions"); expect(value).not.toHaveProperty("capacity"); expect(legacy).toEqual(copy);
  });
  it.each([{ injury: true }, { runPlan: { mode: "starter", restriction: "no running" } }, { settings: { noRunning: true } }, { runDays: [{ restrictions: {} }] }])("holds unsupported safety facts %j", value => {
    expect(map(value).holds).toContain("legacy_safety_review_required");
  });
  it.each([{ runPlan: { mode: "race_prep", phase: "recovery" } }, { runPlan: { mode: "race_prep", recoveryEndDate: "2020-01-01" } }, { runPlan: { mode: "race_prep", completedRaces: ["race"] } }, { runDays: [{ type: "race", completed: false }] }, { raceWeek: "after" }, { runDays: [{ templateId: "easy_30", type: "easy", userOverride: "marathon_race", completed: true }] }])("holds recovery indicators without clearance/date inference %j", value => {
    expect(map(value).holds).toContain("recovery_evidence_required");
  });
  it.each(["easeSnapshot", "deloadSnapshot", "easingBack"])("preserves %s as load review", key => expect(map({ [key]: {} }).holds).toContain("load_review_required"));
  it("retains lift history without treating it as running fitness or restrictions", () => {
    expect(map({ workouts: [{ id: "lift" }], weekHistory: [{ weekNumber: 1, workouts: [] }] }).holds).toEqual([]);
    expect(map({ manualCompletions: { unresolved: true } }).holds).toContain("legacy_safety_review_required");
  });
  it.each(["belowFloor", "compressed"])("retains %s race-load warning", key => {
    expect(map({ runPlan: { mode: "race_prep", [key]: true } }).holds).toContain("load_review_required");
  });
  it("retains matched manual history while unresolved identities stay held", () => {
    const row = { id: "one", templateId: "easy_20", type: "easy" };
    expect(map({ runDays: [row], manualCompletions: { one: { completedAt: 123 } } }).holds).toEqual([]);
    expect(map({ runDays: [{ id: "one" }], manualCompletions: { one: { completedAt: 123 } } }).holds).toContain("legacy_safety_review_required");
    expect(map({ runDays: [row], manualCompletions: { orphan: { completedAt: 123 } } }).holds).toContain("legacy_safety_review_required");
    expect(map({ runDays: [{ ...row, userOverride: "marathon_race" }], manualCompletions: { one: { completedAt: 123 } } }).holds).toContain("recovery_evidence_required");
  });
  it("distinguishes Date history values in exact snapshot digest", () => {
    expect(map({ weekHistory: [new Date(1)] }).snapshotDigest).not.toBe(map({ weekHistory: [new Date(2)] }).snapshotDigest);
  });
  it("keeps nonfinite Firestore numbers distinct from null", () => {
    expect(new Set([NaN, Infinity, -Infinity, null].map(value => map({ workouts: [{ value }] }).snapshotDigest)).size).toBe(4);
  });
  it("hashes exact data independently of property order, retaining unknown facts", () => {
    expect(map({ goal: "a", runDays: [] }).snapshotDigest).toBe(map({ runDays: [], goal: "a" }).snapshotDigest);
    expect(map({ goal: "a", injury: true }).snapshotDigest).not.toBe(map({ goal: "a" }).snapshotDigest);
  });
});
