/**
 * Stress test for the primaryGoal-undefined bug surfaced by the
 * verifier walkthrough (issue #845).
 *
 * Trigger sequence in production:
 *   1. User signs in with a profile lacking `primaryGoal` (the seed
 *      script doesn't set it; real users who skipped the goal step
 *      during onboarding also lack it).
 *   2. useProgram loads their existing programState doc — say a
 *      pre-W1a doc that also lacks the field.
 *   3. normalizeProgramState backfills with `primaryGoal: profile
 *      .primaryGoal` — which is `undefined`. The returned object
 *      now has an EXPLICIT `primaryGoal: undefined` property.
 *   4. The persist-if-changed guard at useProgram.ts:252 sees a
 *      stringify-mismatch because normalize ALSO backfills
 *      `weekHistory: []`, `settings: {...}`, etc. — fields the raw
 *      doc lacked. Guard fires.
 *   5. setDoc(ref, migrated, { merge: true }) hits Firestore with
 *      `primaryGoal: undefined` — rejected with `Unsupported field
 *      value: undefined`.
 *
 * Section error boundary catches and renders "Failed to load
 * programme" + Retry. Retry replays the same flow and fails again.
 *
 * This test pins the bug at the source: normalizeProgramState
 * must NOT introduce an explicit `undefined` field when both
 * state.primaryGoal and backfill.primaryGoal are missing. Same
 * holds for any other backfill target.
 */
import { describe, it, expect } from "vitest";
import { normalizeProgramState } from "../programTypes";
import type { ProgramState } from "../programTypes";

const baseState: ProgramState = {
  goal: "recomp",
  currentPhase: "base",
  weekNumber: 1,
  splitType: "full_body",
  workouts: [],
  fatigueScore: 0,
  updatedAt: Date.now(),
  settings: { autoProgression: true, microloading: true },
  weekHistory: [],
};

describe("normalizeProgramState — undefined-field hygiene (issue #845)", () => {
  it("does NOT write `primaryGoal: undefined` when both state and backfill lack it", () => {
    const result = normalizeProgramState(baseState, { primaryGoal: undefined });
    // The defining test: the key must NOT exist on the result with an
    // explicit undefined value. Either omitted entirely, or absent
    // from the property descriptor list.
    expect(Object.keys(result)).not.toContain("primaryGoal");
  });

  it("does NOT write `primaryGoal: undefined` when no backfill arg is passed", () => {
    const result = normalizeProgramState(baseState);
    expect(Object.keys(result)).not.toContain("primaryGoal");
  });

  it("preserves explicit primaryGoal from state.primaryGoal", () => {
    const result = normalizeProgramState(
      { ...baseState, primaryGoal: "strength" },
      { primaryGoal: undefined }
    );
    expect(result.primaryGoal).toBe("strength");
  });

  it("backfills primaryGoal from profile when state lacks it", () => {
    const result = normalizeProgramState(baseState, {
      primaryGoal: "hypertrophy",
    });
    expect(result.primaryGoal).toBe("hypertrophy");
  });

  it("survives JSON.stringify round-trip without explicit undefined sentinels", () => {
    const result = normalizeProgramState(baseState, { primaryGoal: undefined });
    const serialised = JSON.stringify(result);
    // No `"primaryGoal":` anywhere in the JSON because the field
    // shouldn't exist. Catches the case where the property was added
    // with undefined value (JSON.stringify drops it, but the in-
    // memory object still has the key — and that's what Firestore
    // setDoc sees).
    expect(serialised).not.toContain("primaryGoal");
  });

  it("backfills weekHistory + settings without introducing undefined fields", () => {
    // The trigger condition: a pre-W1a doc that lacks weekHistory +
    // settings + primaryGoal. Normalize should backfill the first
    // two (legitimate defaults) but NOT introduce undefined
    // primaryGoal.
    const partial = {
      goal: "cut",
      currentPhase: "base",
      weekNumber: 1,
      splitType: "full_body",
      workouts: [],
      fatigueScore: 0,
      updatedAt: Date.now(),
    } as ProgramState;
    const result = normalizeProgramState(partial, { primaryGoal: undefined });
    expect(result.weekHistory).toEqual([]);
    expect(result.settings).toEqual({
      autoProgression: true,
      microloading: true,
    });
    expect(Object.keys(result)).not.toContain("primaryGoal");
  });

  it("is Firestore-safe: every own property must have a defined value", () => {
    const result = normalizeProgramState(baseState, { primaryGoal: undefined });
    for (const [key, value] of Object.entries(result)) {
      expect(value, `field ${key} should not be undefined`).not.toBe(undefined);
    }
  });
});
