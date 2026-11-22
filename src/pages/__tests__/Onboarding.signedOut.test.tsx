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

/** Signed out at the review: Start my plan opens Save your plan. */
function openSaveYourPlan() {
  saveSignedOutDraft(review);
  open();
  fireEvent.click(screen.getByRole("button", { name: SETUP.start }));
  expect(
    screen.getByRole("heading", { name: SAVE_PLAN.heading, level: 1 })
  ).toBeInTheDocument();
}

beforeAll(async () => {
  await loadWordFilter();
});
beforeEach(() => {
  localStorage.clear();
  resetFirestore();
  vi.clearAllMocks();
  h.user = null;
  h.profile = null;
  h.complete.mockResolvedValue({ data: { success: true } });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

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

describe("Save your plan", () => {
  it("opens from the review in its place, and Back returns to it", () => {
    openSaveYourPlan();
    expect(screen.getByText(SAVE_PLAN_COPY.lead)).toBeInTheDocument();
    expect(h.complete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("button", { name: SETUP.start })
    ).toBeInTheDocument();
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
      openSaveYourPlan();
      fireEvent.click(screen.getByRole("button", { name }));
      await waitFor(() => expect(method()).toHaveBeenCalledTimes(1));
      expect(markWhenOpened).toMatchObject({ emailOptIn: false });
    }
  );

  it("email makes the account with the address and password typed", async () => {
    openSaveYourPlan();
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
    openSaveYourPlan();
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
