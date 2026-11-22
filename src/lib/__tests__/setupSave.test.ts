// @vitest-environment jsdom
/**
 * Save your plan's mark (A6): what carries setup across the sign-in that
 * makes the account, and keeps an account's plan when it already has one.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  SETUP_SAVE_TTL_MS,
  accountAppeared,
  signedOut,
  cancelSetupSave,
  finishSetupSave,
  keepExistingPlan,
  readSetupSave,
  startSetupSave,
} from "../setupSave";
import {
  loadSignedOutDraft,
  saveSignedOutDraft,
  ONBOARDING_MAX_STEP,
  type OnboardingDraft,
} from "../onboardingDraft";

const draft: OnboardingDraft = {
  step: 7,
  primaryGoal: "strength",
  daysPerWeek: 3,
  equipment: "full_gym",
  runFrequency: "none",
  runMode: "freeform",
  weeklyRunDays: 0,
  raceDistance: "10k",
  raceTargetDate: "",
  injuries: ["none"],
  gender: "male",
  birthYearText: "1990",
  heightCm: 180,
  weightKg: 80,
  heightUnit: "cm",
  weightUnit: "kg",
  trainingWhy: "",
  experience: "beginner",
  healthConsentVersion: 1,
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe("Save your plan's mark", () => {
  it("carries the email answer and the invite field across the sign-in", () => {
    startSetupSave({ emailOptIn: true, inviteCode: "ABCD-1234" });
    expect(readSetupSave()).toMatchObject({
      emailOptIn: true,
      inviteCode: "ABCD-1234",
    });
  });

  it("is gone once the sign-in is closed or failed", () => {
    startSetupSave({ emailOptIn: false, inviteCode: "" });
    cancelSetupSave();
    expect(readSetupSave()).toBeNull();
  });

  it("is gone once the plan is being built", () => {
    startSetupSave({ emailOptIn: false, inviteCode: "" });
    finishSetupSave();
    expect(readSetupSave()).toBeNull();
  });

  it("lasts an hour, so a sign-in that never came back hands nothing on later", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-22T10:00:00Z"));
    startSetupSave({ emailOptIn: true, inviteCode: "" });
    vi.setSystemTime(Date.now() + SETUP_SAVE_TTL_MS + 1);
    expect(readSetupSave()).toBeNull();
    expect(localStorage.getItem("tropos.setupSave")).toBeNull();
  });

  it("refuses a mark it cannot read", () => {
    localStorage.setItem("tropos.setupSave", "{not json");
    expect(readSetupSave()).toBeNull();
    localStorage.setItem(
      "tropos.setupSave",
      JSON.stringify({ emailOptIn: "yes", inviteCode: "", at: Date.now() })
    );
    expect(readSetupSave()).toBeNull();
  });
});

describe("an account that already has a plan keeps it", () => {
  it("drops the answers given signed out, once, and says so once", () => {
    saveSignedOutDraft(draft);
    startSetupSave({ emailOptIn: true, inviteCode: "" });
    expect(keepExistingPlan()).toBe(true);
    expect(loadSignedOutDraft(ONBOARDING_MAX_STEP)).toBeNull();
    expect(readSetupSave()).toBeNull();
    expect(keepExistingPlan()).toBe(false);
  });

  it("without a sign-in from Save your plan, leaves the phone's answers alone", () => {
    saveSignedOutDraft(draft);
    expect(keepExistingPlan()).toBe(false);
    expect(loadSignedOutDraft(ONBOARDING_MAX_STEP)).toEqual(draft);
  });
});

/* Answers given signed out reach no account but the one
   Save your plan made, and nobody after a sign-out. */
describe("the phone's signed-out answers, when an account appears", () => {
  it("are dropped for an account signed in any other way", () => {
    saveSignedOutDraft(draft);
    accountAppeared();
    expect(loadSignedOutDraft(ONBOARDING_MAX_STEP)).toBeNull();
  });

  it("wait for the account Save your plan is making", () => {
    saveSignedOutDraft(draft);
    startSetupSave({ emailOptIn: false, inviteCode: "" });
    accountAppeared();
    expect(loadSignedOutDraft(ONBOARDING_MAX_STEP)).toEqual(draft);
  });

  it("go, with any mark, on sign-out", () => {
    saveSignedOutDraft(draft);
    startSetupSave({ emailOptIn: false, inviteCode: "" });
    signedOut();
    expect(loadSignedOutDraft(ONBOARDING_MAX_STEP)).toBeNull();
    expect(readSetupSave()).toBeNull();
  });
});
