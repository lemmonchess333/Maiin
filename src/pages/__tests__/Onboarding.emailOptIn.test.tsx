/**
 * Setup's email opt-in (App1 Q55). The last step asks once, with a switch
 * that names both emails and says when they come, off until the person
 * turns it on (DESIGN_GUIDE §14n (48), (55)). Turned on, setup sends a yes
 * with the words it showed; left off, it sends nothing about email. An
 * account that has answered before is not asked again.
 */
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  complete: vi.fn(),
  refresh: vi.fn(),
  profile: undefined as undefined | Record<string, unknown>,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "email-setup", email: "test@example.com" },
    profile: h.profile,
    refreshProfile: h.refresh,
  }),
}));
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("firebase/firestore");
vi.mock("firebase/functions", () => ({
  httpsCallable: () => h.complete,
}));
vi.mock("@/lib/firestoreWrite", () => ({
  setDocGuarded: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/lifecycleAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// The sender is live for these tests; until it is on main, setup asks
// nothing (EMAIL_UPDATES_LIVE).
vi.mock("@/lib/emailConsent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/emailConsent")>()),
  EMAIL_UPDATES_LIVE: true,
}));

import Onboarding from "../Onboarding";
import {
  saveOnboardingDraft,
  type OnboardingDraft,
} from "@/lib/onboardingDraft";

/** A lifter at the review. */
const draft: OnboardingDraft = {
  step: 7,
  primaryGoal: "strength",
  daysPerWeek: 3,
  equipment: "full_gym",
  runFrequency: "none",
  runMode: "freeform",
  weeklyRunDays: 2,
  raceDistance: "10k",
  raceTargetDate: "",
  injuries: ["none"],
  gender: "male",
  birthYearText: "1995",
  heightCm: 175,
  weightKg: 81.5,
  heightUnit: "cm",
  weightUnit: "kg",
  trainingWhy: "",
  experience: "beginner",
  goalConfirmed: true,
  runConfirmed: true,
  trainingActivity: "lifting",
  displayName: "Test athlete",
};

const LABEL = "Email me my weekly review, and a note if I stop";

const open = () =>
  render(
    <MemoryRouter>
      <Onboarding />
    </MemoryRouter>
  );
const finish = async () => {
  const start = screen.getByRole("button", { name: "Start my plan" });
  await waitFor(() => expect(start).toBeEnabled());
  fireEvent.click(start);
  await waitFor(() => expect(h.complete).toHaveBeenCalledTimes(1));
};
const sent = () => h.complete.mock.calls[0][0] as Record<string, unknown>;

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  h.profile = undefined;
  h.complete.mockResolvedValue({ data: {} });
  h.refresh.mockResolvedValue(undefined);
  saveOnboardingDraft("email-setup", draft);
});
afterEach(cleanup);

describe("setup's email opt-in", () => {
  it("asks with the real words and time, and is off until turned on", () => {
    open();
    const toggle = screen.getByRole("switch", { name: LABEL });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByText(
        "Mondays at 08:00, last week’s sessions and food. If you stop logging, one email at 2 weeks and one at a month, then none. Every email has an unsubscribe link."
      )
    ).toBeInTheDocument();
  });

  it("sends a yes with the words it showed when turned on", async () => {
    open();
    fireEvent.click(screen.getByRole("switch", { name: LABEL }));
    await finish();
    expect(sent()).toMatchObject({ emailOptIn: true, emailWording: 1 });
    // Never inside the profile, where the sanitiser would drop it.
    expect(sent().profileData).not.toHaveProperty("emailConsent");
    expect(sent().profileData).not.toHaveProperty("emailOptIn");
  });

  it("sends nothing about email when left off", async () => {
    open();
    await finish();
    // Anchor: setup was sent, so a yes would have been on it.
    expect(sent()).toHaveProperty("profileData");
    expect(sent()).not.toHaveProperty("emailOptIn");
    expect(sent()).not.toHaveProperty("emailWording");
  });

  it("does not ask an account that has answered before", async () => {
    h.profile = { emailConsent: { weeklyReview: { on: false } } };
    open();
    expect(screen.queryByRole("switch", { name: LABEL })).toBeNull();
    await finish();
    expect(sent()).not.toHaveProperty("emailOptIn");
  });
});
