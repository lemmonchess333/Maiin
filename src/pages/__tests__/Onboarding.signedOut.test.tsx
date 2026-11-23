/**
 * Setup before there is an account (A6 call 1): the questions signed out,
 * their answers kept on the phone, Save your plan making the account with
 * Apple, Google or email, and the plan built from those answers once it
 * exists, then the trial offer. An account that already has a plan keeps
 * it, and nothing reaches Firestore before an account exists.
 */
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import Onboarding from "../Onboarding";
import {
  ONBOARDING_MAX_STEP,
  loadOnboardingDraft,
  loadSignedOutDraft,
  saveSignedOutDraft,
  type OnboardingDraft,
} from "@/lib/onboardingDraft";
import {
  KEPT_PLAN_NOTICE,
  SAVE_PLAN_COPY,
  SIGNED_OUT_AGREEMENT_MAX_AGE_MS,
  SIGNED_OUT_AGREEMENT_MAX_AWAY_MS,
  __resetSetupVisitForTests,
  readSetupSave,
  startSetupSave,
} from "@/lib/setupSave";
import {
  HEALTH_CONSENT_COPY,
  HEALTH_CONSENT_DECLINED_SIGNED_OUT_COPY,
} from "@/lib/healthConsent";
import { loadWordFilter } from "@/lib/wordFilter";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { track } from "@/lib/lifecycleAnalytics";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";
import { SAVE_PLAN, SETUP } from "@/test/journeyScreens";
import { TRIAL_OFFER_PATH } from "@/lib/trialOffer";

const h = vi.hoisted(() => ({
  user: null as null | { uid: string; email: string | null },
  profile: null as null | Record<string, unknown>,
  complete: vi.fn(),
  refresh: vi.fn().mockResolvedValue(undefined),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signInWithApple: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: h.user,
    profile: h.profile,
    refreshProfile: h.refresh,
    signOut: vi.fn().mockResolvedValue(undefined),
    signIn: h.signIn,
    signUp: h.signUp,
    signInWithApple: h.signInWithApple,
    signInWithGoogle: h.signInWithGoogle,
    resetPassword: vi.fn(),
    fetchSignInMethods: vi.fn().mockResolvedValue([]),
  }),
  hasSignedInOnThisDevice: () => false,
}));
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("firebase/firestore");
vi.mock("firebase/functions", () => ({ httpsCallable: () => h.complete }));
vi.mock("@/lib/firestoreWrite", () => ({
  setDocGuarded: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/lifecycleAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/** Setup's answers at the review, the agreement given, a name typed. */
const review: OnboardingDraft = {
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
  gender: "female",
  birthYearText: "1994",
  heightCm: 168,
  weightKg: 64,
  heightUnit: "cm",
  weightUnit: "kg",
  trainingWhy: "",
  experience: "beginner",
  goalConfirmed: true,
  runConfirmed: true,
  equipmentConfirmed: true,
  experienceConfirmed: true,
  bodyAnswered: true,
  displayName: "Robin",
  trainingActivity: "lifting",
  healthConsentVersion: 1,
};

function Route() {
  const location = useLocation();
  return <output aria-label="Current route">{location.pathname}</output>;
}

const open = (path = "/setup") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Onboarding />
      <Route />
    </MemoryRouter>
  );

const route = () => screen.getByLabelText("Current route");

/** The app going to the background, or coming back. */
function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
  fireEvent(document, new Event("visibilitychange"));
}

/* The phone's clock, held still so that only `later` moves it: read live,
   the milliseconds a slow runner spends between going to the background
   and the clock's move count as time away, and two hours read as more. */
let clockNow = 0;
function holdClock() {
  clockNow = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => clockNow);
}

/** The phone's clock moved on by `ms`. */
function later(ms: number) {
  clockNow += ms;
}

const agreementHeading = () =>
  screen.queryByRole("heading", { name: SETUP.healthDetails, level: 1 });

/** Signed out at the review, picked up cold: the agreement is asked again
 *  and given, the review comes back, and its Continue opens Save your
 *  plan, whose ways in are their own chunk. */
async function openSaveYourPlan() {
  saveSignedOutDraft(review);
  open();
  fireEvent.click(screen.getByRole("button", { name: SETUP.agreeHealth }));
  fireEvent.click(screen.getByRole("button", { name: SETUP.saveNext }));
  expect(
    screen.getByRole("heading", { name: SAVE_PLAN.heading, level: 1 })
  ).toBeInTheDocument();
  await screen.findByRole("button", { name: SAVE_PLAN.apple });
}

beforeAll(async () => {
  await loadWordFilter();
});
beforeEach(() => {
  localStorage.clear();
  __resetSetupVisitForTests();
  resetFirestore();
  vi.clearAllMocks();
  h.user = null;
  h.profile = null;
  h.complete.mockResolvedValue({ data: { success: true } });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setVisibility("visible");
});

describe("setup before there is an account", () => {
  it("keeps the answers on the phone, through a reload, and sends nothing", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Build muscle/ }));
    fireEvent.click(screen.getByRole("button", { name: SETUP.continue }));
    expect(loadSignedOutDraft(ONBOARDING_MAX_STEP)).toMatchObject({
      primaryGoal: "hypertrophy",
      goalConfirmed: true,
      step: 1,
    });
    // The app killed and opened again: setup picks up where it was.
    cleanup();
    open();
    expect(
      screen.getByRole("radiogroup", { name: SETUP.activities })
    ).toBeInTheDocument();
    expect(h.complete).not.toHaveBeenCalled();
    expect(setDocGuarded).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith("setup_started", { signedIn: false });
  });

  it("has no account to open: its corner leaves for the welcome", () => {
    open();
    expect(
      screen.queryByRole("button", { name: "Account settings" })
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close setup" }));
    expect(route()).toHaveTextContent(/^\/$/);
  });

  it("at the agreement, Not now offers going back or leaving, and leaving forgets the answers", () => {
    saveSignedOutDraft({
      ...review,
      step: 8,
      healthConsentVersion: undefined,
      bodyAnswered: false,
    });
    open();
    fireEvent.click(
      screen.getByRole("button", { name: HEALTH_CONSENT_COPY.decline })
    );
    expect(
      screen.getByText(HEALTH_CONSENT_DECLINED_SIGNED_OUT_COPY.body)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Delete my account" })
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: HEALTH_CONSENT_DECLINED_SIGNED_OUT_COPY.leave,
      })
    );
    expect(route()).toHaveTextContent(/^\/$/);
    expect(loadSignedOutDraft(ONBOARDING_MAX_STEP)).toBeNull();
  });
});

/* The agreement to store health details is a person's,
   and a phone's signed-out answers can be someone else's by the time setup
   is opened again. */
describe("the agreement, on answers picked up cold", () => {
  it("is asked again, and I agree returns to the review", () => {
    saveSignedOutDraft(review);
    open();
    expect(
      screen.getByRole("heading", { name: SETUP.healthDetails, level: 1 })
    ).toBeInTheDocument();
    expect(loadSignedOutDraft(ONBOARDING_MAX_STEP)?.healthConsentVersion).toBe(
      undefined
    );
    fireEvent.click(screen.getByRole("button", { name: SETUP.agreeHealth }));
    expect(
      screen.getByRole("button", { name: SETUP.saveNext })
    ).toBeInTheDocument();
    expect(loadSignedOutDraft(ONBOARDING_MAX_STEP)?.healthConsentVersion).toBe(
      1
    );
  });

  it("is not asked twice in one open of the app", () => {
    saveSignedOutDraft(review);
    open();
    fireEvent.click(screen.getByRole("button", { name: SETUP.agreeHealth }));
    // Back to the welcome and in again, the app still open.
    cleanup();
    open();
    expect(
      screen.getByRole("button", { name: SETUP.saveNext })
    ).toBeInTheDocument();
  });
});

/* Held in memory, the agreement lapses with the app still open: after two
   hours in the background, or two days from I agree. Setup on screen then
   asks for it again, as it does for answers picked up cold. */
describe("the agreement, with the app left open", () => {
  beforeEach(holdClock);

  it("stands after a short time in the background", () => {
    saveSignedOutDraft(review);
    open();
    fireEvent.click(screen.getByRole("button", { name: SETUP.agreeHealth }));
    setVisibility("hidden");
    later(SIGNED_OUT_AGREEMENT_MAX_AWAY_MS);
    setVisibility("visible");
    expect(
      screen.getByRole("button", { name: SETUP.saveNext })
    ).toBeInTheDocument();
  });

  it("is asked again after two hours in the background, and I agree returns to the review", () => {
    saveSignedOutDraft(review);
    open();
    fireEvent.click(screen.getByRole("button", { name: SETUP.agreeHealth }));
    setVisibility("hidden");
    later(SIGNED_OUT_AGREEMENT_MAX_AWAY_MS + 1);
    setVisibility("visible");
    expect(agreementHeading()).toBeInTheDocument();
    // The phone's copy no longer carries it either.
    expect(loadSignedOutDraft(ONBOARDING_MAX_STEP)?.healthConsentVersion).toBe(
      undefined
    );
    fireEvent.click(screen.getByRole("button", { name: SETUP.agreeHealth }));
    expect(
      screen.getByRole("button", { name: SETUP.saveNext })
    ).toBeInTheDocument();
  });

  it("is asked again in place of Save your plan, on screen when it lapsed", async () => {
    await openSaveYourPlan();
    setVisibility("hidden");
    later(SIGNED_OUT_AGREEMENT_MAX_AWAY_MS + 1);
    setVisibility("visible");
    expect(agreementHeading()).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: SAVE_PLAN.heading, level: 1 })
    ).toBeNull();
  });

  it("is asked again two days after I agree, before Save your plan opens", () => {
    saveSignedOutDraft(review);
    open();
    fireEvent.click(screen.getByRole("button", { name: SETUP.agreeHealth }));
    later(SIGNED_OUT_AGREEMENT_MAX_AGE_MS + 1);
    fireEvent.click(screen.getByRole("button", { name: SETUP.saveNext }));
    expect(agreementHeading()).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: SAVE_PLAN.heading, level: 1 })
    ).toBeNull();
  });
});

describe("Save your plan", () => {
  it("opens from the review in its place, and Back returns to it", async () => {
    await openSaveYourPlan();
    expect(screen.getByText(SAVE_PLAN_COPY.lead)).toBeInTheDocument();
    expect(h.complete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    // Signed out, the review's button is Continue: the plan comes after
    // the account.
    expect(
      screen.getByRole("button", { name: SETUP.saveNext })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SETUP.start })).toBeNull();
  });

  it.each([
    ["Apple", () => h.signInWithApple, SAVE_PLAN.apple],
    ["Google", () => h.signInWithGoogle, SAVE_PLAN.google],
  ] as const)(
    "%s marks the sign-in as setup's, with the review's answers",
    async (_, method, name) => {
      let markWhenOpened: unknown = null;
      method().mockImplementation(async () => {
        markWhenOpened = readSetupSave();
      });
      await openSaveYourPlan();
      fireEvent.click(screen.getByRole("button", { name }));
      await waitFor(() => expect(method()).toHaveBeenCalledTimes(1));
      expect(markWhenOpened).toMatchObject({ emailOptIn: false });
    }
  );

  it("email makes the account with the address and password typed", async () => {
    await openSaveYourPlan();
    fireEvent.change(screen.getByLabelText(SAVE_PLAN.email), {
      target: { value: "robin@example.com" },
    });
    fireEvent.change(screen.getByLabelText(SAVE_PLAN.password), {
      target: { value: "secret-pass" },
    });
    fireEvent.click(screen.getByRole("button", { name: SAVE_PLAN.create }));
    await waitFor(() =>
      expect(h.signUp).toHaveBeenCalledWith("robin@example.com", "secret-pass")
    );
    expect(readSetupSave()).not.toBeNull();
  });

  it("a sheet closed or a sign-in refused leaves nothing waiting", async () => {
    h.signInWithApple.mockRejectedValue(
      Object.assign(new Error("auth/popup-closed-by-user"), {
        code: "auth/popup-closed-by-user",
      })
    );
    await openSaveYourPlan();
    fireEvent.click(screen.getByRole("button", { name: SAVE_PLAN.apple }));
    await waitFor(() => expect(h.signInWithApple).toHaveBeenCalled());
    await waitFor(() => expect(readSetupSave()).toBeNull());
    // The answers are still on the phone for the next try.
    expect(loadSignedOutDraft(ONBOARDING_MAX_STEP)).toMatchObject({ step: 7 });
  });
});

describe("once the account exists", () => {
  /** What the sign-in leaves: the mark, the answers on the phone, and
   *  setup drawn again under the new account. */
  function signedInFromSave(
    method: "apple" | "google" | "email",
    save = { emailOptIn: true, inviteCode: "" }
  ) {
    saveSignedOutDraft(review);
    startSetupSave(save);
    h.user = {
      uid: `new-${method}`,
      email: method === "apple" ? null : `${method}@example.com`,
    };
    return open("/setup");
  }

  it.each(["apple", "google", "email"] as const)(
    "a new %s account takes the answers and the plan is built at once",
    async (method) => {
      signedInFromSave(method);
      await waitFor(() => expect(h.complete).toHaveBeenCalledTimes(1));
      const payload = h.complete.mock.calls[0][0];
      expect(payload.profileData).toMatchObject({
        primaryGoal: "strength",
        displayName: "Robin",
        weightKg: 64,
        birthYear: 1994,
      });
      expect(payload.healthDataConsent).toEqual({ version: 1 });
      // The review's email answer came across the sign-in.
      expect(payload.emailOptIn).toBe(true);
      await waitFor(() =>
        expect(route()).toHaveTextContent(new RegExp(`^${TRIAL_OFFER_PATH}$`))
      );
      expect(h.refresh).toHaveBeenCalled();
      // Nothing is left waiting, on the phone or the account.
      expect(loadSignedOutDraft(ONBOARDING_MAX_STEP)).toBeNull();
      expect(loadOnboardingDraft(`new-${method}`, ONBOARDING_MAX_STEP)).toBe(
        null
      );
      expect(readSetupSave()).toBeNull();
    }
  );

  it("an account that already has a plan keeps it: nothing is replaced", async () => {
    seedFirestore({ "users/new-apple": { onboardingComplete: true } });
    signedInFromSave("apple");
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(KEPT_PLAN_NOTICE)
    );
    await waitFor(() => expect(route()).toHaveTextContent(/^\/$/));
    expect(h.complete).not.toHaveBeenCalled();
    expect(loadSignedOutDraft(ONBOARDING_MAX_STEP)).toBeNull();
    expect(readSetupSave()).toBeNull();
  });

  it("an account signed in any other way never takes the phone's answers", async () => {
    saveSignedOutDraft(review);
    h.user = { uid: "someone-else", email: "else@example.com" };
    open("/");
    // Their own setup, from its first question.
    expect(
      screen.getByRole("button", { name: /Build muscle/ })
    ).toBeInTheDocument();
    expect(h.complete).not.toHaveBeenCalled();
    expect(loadSignedOutDraft(ONBOARDING_MAX_STEP)).toEqual(review);
  });

  it("an account that has had a trial goes Home after its plan", async () => {
    h.profile = { hasUsedTrial: true };
    signedInFromSave("google");
    await waitFor(() => expect(h.complete).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(route()).toHaveTextContent(/^\/$/));
  });

  it("Try again after a lost answer carries on with the plan it built, never reads as kept", async () => {
    // The first call's answer is lost; the server had saved the plan, so
    // it refuses the second.
    h.complete
      .mockRejectedValueOnce({ code: "functions/permission-denied" })
      .mockRejectedValueOnce({ code: "functions/already-exists" });
    signedInFromSave("google");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Try again" })
      ).toBeInTheDocument()
    );
    seedFirestore({ "users/new-google": { onboardingComplete: true } });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(h.complete).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(route()).toHaveTextContent(new RegExp(`^${TRIAL_OFFER_PATH}$`))
    );
    expect(toast.success).not.toHaveBeenCalledWith(KEPT_PLAN_NOTICE);
  });

  it("a timed-out call that built the plan carries on when its retry is refused", async () => {
    h.complete
      .mockRejectedValueOnce({ code: "functions/deadline-exceeded" })
      .mockRejectedValueOnce({ code: "functions/already-exists" });
    signedInFromSave("email");
    await waitFor(() => expect(h.complete).toHaveBeenCalledTimes(2), {
      timeout: 3000,
    });
    await waitFor(() =>
      expect(route()).toHaveTextContent(new RegExp(`^${TRIAL_OFFER_PATH}$`))
    );
    expect(toast.success).not.toHaveBeenCalledWith(KEPT_PLAN_NOTICE);
  });

  it("a plan the server finds first, from another phone, is kept", async () => {
    // The account read showed no plan; another phone's landed before this
    // one's, and the server refused this one.
    h.complete.mockRejectedValueOnce({ code: "functions/already-exists" });
    signedInFromSave("apple");
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(KEPT_PLAN_NOTICE)
    );
    await waitFor(() => expect(route()).toHaveTextContent(/^\/$/));
    expect(h.complete).toHaveBeenCalledTimes(1);
    expect(loadOnboardingDraft("new-apple", ONBOARDING_MAX_STEP)).toBeNull();
    expect(loadSignedOutDraft(ONBOARDING_MAX_STEP)).toBeNull();
    expect(readSetupSave()).toBeNull();
  });

  it("a plan that could not be saved stays on the review with Try again", async () => {
    h.complete.mockRejectedValue({ code: "functions/permission-denied" });
    signedInFromSave("email");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Try again" })
      ).toBeInTheDocument()
    );
    expect(route()).toHaveTextContent(/^\/setup$/);
    // The answers are the account's now, kept for Try again.
    expect(loadOnboardingDraft("new-email", ONBOARDING_MAX_STEP)).toMatchObject(
      { step: 7 }
    );
  });
});
