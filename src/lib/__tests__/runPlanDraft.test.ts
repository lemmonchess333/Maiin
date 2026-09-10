// @vitest-environment jsdom — needs DOM/storage APIs; the rest of this directory runs in the fast node environment.
/**
 * The run-plan draft survives leaving the page, and nothing else.
 *
 * The rejection cases carry the weight here: a draft that restores when
 * it should not is worse than one that never restores, because it silently
 * reinstates settings the user believes they abandoned.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadRunPlanDraft,
  saveRunPlanDraft,
  clearRunPlanDraft,
  RUN_PLAN_DRAFT_VERSION,
  RUN_PLAN_DRAFT_TTL_MS,
  type RunPlanDraft,
} from "../runPlanDraft";

const draft = (over: Partial<RunPlanDraft> = {}): RunPlanDraft => ({
  runMode: "race_prep",
  weeklyRunDays: 4,
  raceDistance: "half",
  raceTargetDate: "2027-04-18",
  raceEventName: "Brighton",
  raceTimeStr: "1:45:00",
  raceEventSpaceId: "",
  runVolume: "standard",
  runDifficulty: "standard",
  ...over,
});

const KEY = "tropos.runPlan.draft:u1";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("runPlanDraft", () => {
  it("round-trips a draft", () => {
    saveRunPlanDraft("u1", draft());
    expect(loadRunPlanDraft("u1")).toEqual(draft());
  });

  it("keeps an INVALID goal time — the unfinished edit is the point", () => {
    saveRunPlanDraft("u1", draft({ raceTimeStr: "abc" }));
    expect(loadRunPlanDraft("u1")?.raceTimeStr).toBe("abc");
  });

  it("never hands one account's draft to another", () => {
    // PR #820's shared-device lesson: the key scopes it, the echoed uid
    // cross-checks it. This moves the VALUE to the other key, so only the
    // echo can catch it.
    saveRunPlanDraft("u1", draft());
    const stored = localStorage.getItem(KEY)!;
    localStorage.setItem("tropos.runPlan.draft:u2", stored);
    expect(loadRunPlanDraft("u2")).toBeNull();
  });

  it("discards a draft past its TTL", () => {
    saveRunPlanDraft("u1", draft());
    const stored = JSON.parse(localStorage.getItem(KEY)!);
    stored.savedAt = Date.now() - RUN_PLAN_DRAFT_TTL_MS - 1;
    localStorage.setItem(KEY, JSON.stringify(stored));
    expect(loadRunPlanDraft("u1")).toBeNull();
  });

  it("keeps a draft just INSIDE the TTL — the counterweight", () => {
    // Without this, "discards past its TTL" is satisfied by a loader that
    // discards everything.
    saveRunPlanDraft("u1", draft());
    const stored = JSON.parse(localStorage.getItem(KEY)!);
    stored.savedAt = Date.now() - RUN_PLAN_DRAFT_TTL_MS + 60_000;
    localStorage.setItem(KEY, JSON.stringify(stored));
    expect(loadRunPlanDraft("u1")).not.toBeNull();
  });

  it("discards a draft from an older schema", () => {
    saveRunPlanDraft("u1", draft());
    const stored = JSON.parse(localStorage.getItem(KEY)!);
    stored.v = RUN_PLAN_DRAFT_VERSION - 1;
    localStorage.setItem(KEY, JSON.stringify(stored));
    expect(loadRunPlanDraft("u1")).toBeNull();
  });

  it.each([
    ["an unknown distance", { raceDistance: "ultra" }],
    ["an unknown volume preset", { runVolume: "low" }],
    ["an unknown difficulty preset", { runDifficulty: "easier" }],
    ["a non-numeric run-day count", { weeklyRunDays: "four" }],
    ["an out-of-range run-day count", { weeklyRunDays: 9 }],
    ["a mistyped event name", { raceEventName: 42 }],
  ])("rejects the WHOLE draft for %s", (_name, bad) => {
    /* Strict, not merged. A partial restore over the editor's defaults
       would be a second copy of those defaults, free to drift from the
       real ones. */
    saveRunPlanDraft("u1", draft());
    const stored = { ...JSON.parse(localStorage.getItem(KEY)!), ...bad };
    localStorage.setItem(KEY, JSON.stringify(stored));
    expect(loadRunPlanDraft("u1")).toBeNull();
  });

  it("clears a structurally broken entry so it is not re-parsed forever", () => {
    localStorage.setItem(KEY, "{not json");
    expect(loadRunPlanDraft("u1")).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("clear removes it", () => {
    saveRunPlanDraft("u1", draft());
    clearRunPlanDraft("u1");
    expect(loadRunPlanDraft("u1")).toBeNull();
  });

  it("survives storage being unavailable", () => {
    // Private mode / quota. A draft is an enhancement, never a gate.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => saveRunPlanDraft("u1", draft())).not.toThrow();
    expect(saveRunPlanDraft("u1", draft())).toBe(false);
  });
});
