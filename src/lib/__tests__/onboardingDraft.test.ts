// @vitest-environment jsdom — needs DOM/storage APIs; the rest of this directory runs in the fast node environment (audit batch 2).
/**
 * D-2 onboarding draft persistence (frontend-design-principles-2026-07).
 *
 * The save → load round-trip IS the simulated remount: Onboarding.tsx seeds
 * every useState initial from loadOnboardingDraft, so "load returns exactly
 * what was saved" is the property that guarantees a killed app resumes at
 * the same step with the same answers.
 *
 * Also pins the safety rails: uid scoping (PR #820 shared-device lesson),
 * strict whole-draft rejection on any invalid field, version + TTL expiry,
 * and clear-on-complete.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  saveOnboardingDraft,
  loadOnboardingDraft,
  clearOnboardingDraft,
  isValidDraft,
  DRAFT_VERSION,
  DRAFT_TTL_MS,
  type OnboardingDraft,
} from "../onboardingDraft";

const MAX_STEP = 7; // TOTAL_STEPS - 1 in Onboarding.tsx

const UID_A = "user-aaa";
const UID_B = "user-bbb";
const keyFor = (uid: string) => `tropos.onboarding.draft.${uid}`;

function makeDraft(over: Partial<OnboardingDraft> = {}): OnboardingDraft {
  return {
    step: 4,
    primaryGoal: "strength",
    daysPerWeek: 3,
    equipment: "home_gym",
    runFrequency: "regular",
    runMode: "race_prep",
    weeklyRunDays: 3,
    raceDistance: "half",
    raceTargetDate: "2026-10-04",
    injuries: ["knee", "none"],
    gender: "female",
    ageRange: "35-44",
    heightCm: 168,
    weightKg: 62,
    heightUnit: "cm",
    weightUnit: "kg",
    trainingWhy: "Run a race",
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("round-trip (the simulated remount)", () => {
  it("load returns exactly what was saved — step and every answer", () => {
    const draft = makeDraft();
    saveOnboardingDraft(UID_A, draft);
    expect(loadOnboardingDraft(UID_A, MAX_STEP)).toEqual(draft);
  });

  it("a later save overwrites the earlier one (write-per-step semantics)", () => {
    saveOnboardingDraft(UID_A, makeDraft({ step: 1 }));
    saveOnboardingDraft(UID_A, makeDraft({ step: 2, primaryGoal: "fat_loss" }));
    const restored = loadOnboardingDraft(UID_A, MAX_STEP);
    expect(restored?.step).toBe(2);
    expect(restored?.primaryGoal).toBe("fat_loss");
  });

  it("no draft → null (fresh start)", () => {
    expect(loadOnboardingDraft(UID_A, MAX_STEP)).toBeNull();
  });

  it("empty uid never reads or writes", () => {
    saveOnboardingDraft("", makeDraft());
    expect(localStorage.length).toBe(0);
    expect(loadOnboardingDraft("", MAX_STEP)).toBeNull();
  });
});

describe("uid scoping (shared-device isolation)", () => {
  it("account B never sees account A's draft, and A's stays intact", () => {
    const draft = makeDraft();
    saveOnboardingDraft(UID_A, draft);
    expect(loadOnboardingDraft(UID_B, MAX_STEP)).toBeNull();
    expect(loadOnboardingDraft(UID_A, MAX_STEP)).toEqual(draft);
  });

  it("an envelope whose inner uid doesn't match the key is rejected", () => {
    saveOnboardingDraft(UID_A, makeDraft());
    // Simulate a tampered/miscopied blob: A's envelope under B's key.
    localStorage.setItem(keyFor(UID_B), localStorage.getItem(keyFor(UID_A))!);
    expect(loadOnboardingDraft(UID_B, MAX_STEP)).toBeNull();
  });
});

describe("expiry and versioning", () => {
  it("drops a draft past the 14-day TTL (and removes the blob)", () => {
    saveOnboardingDraft(UID_A, makeDraft());
    const envelope = JSON.parse(localStorage.getItem(keyFor(UID_A))!);
    envelope.savedAt = Date.now() - DRAFT_TTL_MS - 1000;
    localStorage.setItem(keyFor(UID_A), JSON.stringify(envelope));
    expect(loadOnboardingDraft(UID_A, MAX_STEP)).toBeNull();
    expect(localStorage.getItem(keyFor(UID_A))).toBeNull();
  });

  it("keeps a draft within the TTL", () => {
    saveOnboardingDraft(UID_A, makeDraft());
    const envelope = JSON.parse(localStorage.getItem(keyFor(UID_A))!);
    envelope.savedAt = Date.now() - (DRAFT_TTL_MS - 60_000);
    localStorage.setItem(keyFor(UID_A), JSON.stringify(envelope));
    expect(loadOnboardingDraft(UID_A, MAX_STEP)).not.toBeNull();
  });

  it("drops a draft from a different schema version", () => {
    saveOnboardingDraft(UID_A, makeDraft());
    const envelope = JSON.parse(localStorage.getItem(keyFor(UID_A))!);
    envelope.v = DRAFT_VERSION + 1;
    localStorage.setItem(keyFor(UID_A), JSON.stringify(envelope));
    expect(loadOnboardingDraft(UID_A, MAX_STEP)).toBeNull();
  });

  it("drops unparseable JSON (and removes the blob)", () => {
    localStorage.setItem(keyFor(UID_A), "{not json");
    expect(loadOnboardingDraft(UID_A, MAX_STEP)).toBeNull();
    expect(localStorage.getItem(keyFor(UID_A))).toBeNull();
  });
});

describe("strict validation — any bad field rejects the whole draft", () => {
  const rejects = (over: Record<string, unknown>) => {
    saveOnboardingDraft(UID_A, {
      ...makeDraft(),
      ...over,
    } as unknown as OnboardingDraft);
    expect(loadOnboardingDraft(UID_A, MAX_STEP)).toBeNull();
  };

  it("out-of-vocabulary enums", () => {
    rejects({ primaryGoal: "become-a-wizard" });
    rejects({ equipment: "spaceship" });
    rejects({ gender: 42 });
    rejects({ ageRange: "9000+" });
    rejects({ runMode: "structured-race" });
    rejects({ raceDistance: "ultra" });
  });

  it("step out of range / non-integer", () => {
    rejects({ step: MAX_STEP + 1 });
    rejects({ step: -1 });
    rejects({ step: 2.5 });
  });

  it("body metrics outside plausible bounds", () => {
    rejects({ heightCm: 20 });
    rejects({ weightKg: 5000 });
    rejects({ weightKg: Number.NaN });
  });

  it("malformed injuries list", () => {
    rejects({ injuries: "knee" });
    rejects({ injuries: [1, 2] });
  });

  it("missing field", () => {
    const draft = makeDraft() as unknown as Record<string, unknown>;
    delete draft.trainingWhy;
    saveOnboardingDraft(UID_A, draft as unknown as OnboardingDraft);
    expect(loadOnboardingDraft(UID_A, MAX_STEP)).toBeNull();
  });

  it("isValidDraft accepts the boundary values the UI can actually produce", () => {
    expect(isValidDraft(makeDraft({ step: 0 }), MAX_STEP)).toBe(true);
    expect(isValidDraft(makeDraft({ step: MAX_STEP }), MAX_STEP)).toBe(true);
    expect(
      isValidDraft(makeDraft({ heightCm: 100, weightKg: 30 }), MAX_STEP)
    ).toBe(true);
    expect(
      isValidDraft(makeDraft({ heightCm: 250, weightKg: 250 }), MAX_STEP)
    ).toBe(true);
    expect(isValidDraft(makeDraft({ weeklyRunDays: 0 }), MAX_STEP)).toBe(true);
    expect(isValidDraft(makeDraft({ weeklyRunDays: 7 }), MAX_STEP)).toBe(true);
    expect(isValidDraft(makeDraft({ injuries: [] }), MAX_STEP)).toBe(true);
  });
});

describe("clear-on-complete", () => {
  it("removes the draft for that uid only", () => {
    saveOnboardingDraft(UID_A, makeDraft());
    saveOnboardingDraft(UID_B, makeDraft({ step: 1 }));
    clearOnboardingDraft(UID_A);
    expect(loadOnboardingDraft(UID_A, MAX_STEP)).toBeNull();
    expect(loadOnboardingDraft(UID_B, MAX_STEP)).not.toBeNull();
  });
});
