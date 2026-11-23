// @vitest-environment jsdom
/**
 * Save your plan's mark (A6): what carries setup across the sign-in that
 * makes the account, and keeps an account's plan when it already has one.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  SETUP_SAVE_TTL_MS,
  SIGNED_OUT_AGREEMENT_MAX_AGE_MS,
  SIGNED_OUT_AGREEMENT_MAX_AWAY_MS,
  __resetSetupVisitForTests,
  accountAppeared,
  signedOut,
  cancelSetupSave,
  finishSetupSave,
  forgetSetupSent,
  keepExistingPlan,
  noteSetupSent,
  noteSignedOutAgreement,
  onSignedOutAgreementLapsed,
  readSetupSave,
  refusedBeforeWriting,
  refusedForExistingPlan,
  setupSentThisVisitFor,
  signedOutAgreementThisVisit,
  startSetupSave,
} from "../setupSave";
import {
  loadSignedOutDraft,
  saveSignedOutDraft,
  ONBOARDING_MAX_STEP,
  type OnboardingDraft,
} from "../onboardingDraft";
import { restoreRealTimers } from "@/test/fakeTimers";

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

beforeEach(() => {
  localStorage.clear();
  __resetSetupVisitForTests();
});
afterEach(async () => {
  __resetSetupVisitForTests();
  setVisibility("visible");
  await restoreRealTimers();
});

/** The app going to the background, or coming back. */
function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

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

describe("the server's refusal of an account that already has a plan", () => {
  it("is already-exists, as the callable SDK spells it or bare", () => {
    expect(refusedForExistingPlan({ code: "functions/already-exists" })).toBe(
      true
    );
    expect(refusedForExistingPlan({ code: "already-exists" })).toBe(true);
    expect(refusedForExistingPlan({ code: "functions/internal" })).toBe(false);
    expect(refusedForExistingPlan(null)).toBe(false);
  });
});

describe("an ask to build the plan, refused before anything was written", () => {
  it("is each code completeOnboarding refuses with before its transaction", () => {
    for (const code of [
      "unauthenticated",
      "resource-exhausted",
      "invalid-argument",
      "failed-precondition",
    ]) {
      expect(refusedBeforeWriting({ code: `functions/${code}` })).toBe(true);
      expect(refusedBeforeWriting({ code })).toBe(true);
    }
  });

  it("is not an answer that leaves the outcome unknown, nor a plan found", () => {
    for (const code of [
      "functions/internal",
      "functions/deadline-exceeded",
      "functions/unavailable",
      "functions/permission-denied",
      "functions/already-exists",
    ])
      expect(refusedBeforeWriting({ code })).toBe(false);
    expect(refusedBeforeWriting(null)).toBe(false);
    expect(refusedBeforeWriting({})).toBe(false);
  });

  it("is forgotten as sent, for that account alone", () => {
    noteSetupSent("a");
    noteSetupSent("b");
    forgetSetupSent("a");
    expect(setupSentThisVisitFor("a")).toBe(false);
    expect(setupSentThisVisitFor("b")).toBe(true);
  });
});

/* The agreement to store health details, given signed out, is held in
   memory; on iOS an app can stay open for days, so it lapses on whichever
   comes first: two hours in the background or two days from I agree. */
describe("the agreement given signed out", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-22T10:00:00Z"));
  });

  it("stands through a short time in the background", () => {
    noteSignedOutAgreement();
    setVisibility("hidden");
    vi.setSystemTime(Date.now() + SIGNED_OUT_AGREEMENT_MAX_AWAY_MS);
    setVisibility("visible");
    expect(signedOutAgreementThisVisit()).toBe(true);
  });

  it("lapses after two hours in the background, and says so", () => {
    const lapsed = vi.fn();
    onSignedOutAgreementLapsed(lapsed);
    noteSignedOutAgreement();
    setVisibility("hidden");
    vi.setSystemTime(Date.now() + SIGNED_OUT_AGREEMENT_MAX_AWAY_MS + 1);
    setVisibility("visible");
    expect(lapsed).toHaveBeenCalledTimes(1);
    expect(signedOutAgreementThisVisit()).toBe(false);
  });

  it("counts only the time away since it was given", () => {
    setVisibility("hidden");
    vi.setSystemTime(Date.now() + SIGNED_OUT_AGREEMENT_MAX_AWAY_MS * 3);
    setVisibility("visible");
    noteSignedOutAgreement();
    expect(signedOutAgreementThisVisit()).toBe(true);
  });

  it("lapses two days after I agree, the app on screen all along", () => {
    const lapsed = vi.fn();
    onSignedOutAgreementLapsed(lapsed);
    noteSignedOutAgreement();
    vi.advanceTimersByTime(SIGNED_OUT_AGREEMENT_MAX_AGE_MS);
    expect(signedOutAgreementThisVisit()).toBe(true);
    expect(lapsed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(lapsed).toHaveBeenCalledTimes(1);
    expect(signedOutAgreementThisVisit()).toBe(false);
  });

  it("lapses two days after I agree, however short each time away", () => {
    noteSignedOutAgreement();
    // Two days of short trips away, the timer held while each lasts.
    for (let hour = 0; hour < 49; hour++) {
      setVisibility("hidden");
      vi.setSystemTime(Date.now() + 60 * 60 * 1000);
      setVisibility("visible");
    }
    expect(signedOutAgreementThisVisit()).toBe(false);
  });

  it("lapses when the clock is set back before I agree, and says so", () => {
    const lapsed = vi.fn();
    onSignedOutAgreementLapsed(lapsed);
    noteSignedOutAgreement();
    vi.setSystemTime(Date.now() - 1);
    expect(signedOutAgreementThisVisit()).toBe(false);
    expect(lapsed).toHaveBeenCalledTimes(1);
  });

  it("lapses when the clock was set back while the app was away", () => {
    noteSignedOutAgreement();
    setVisibility("hidden");
    vi.setSystemTime(Date.now() - 60 * 60 * 1000);
    setVisibility("visible");
    expect(signedOutAgreementThisVisit()).toBe(false);
  });

  it("stops telling a listener that has gone", () => {
    const lapsed = vi.fn();
    const stop = onSignedOutAgreementLapsed(lapsed);
    noteSignedOutAgreement();
    stop();
    vi.advanceTimersByTime(SIGNED_OUT_AGREEMENT_MAX_AGE_MS + 1);
    expect(lapsed).not.toHaveBeenCalled();
  });
});
