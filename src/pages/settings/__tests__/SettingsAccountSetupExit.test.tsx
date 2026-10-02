/**
 * Leaving an unfinished setup by signing out is reported as
 * onboarding_abandoned, with the step the saved answers reached (A1b pin
 * 4). It is the one exit from onboarding the app can see: closing the app
 * looks the same as pausing it. A finished account with a deletion pending
 * gets the same page, and is not leaving setup.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { saveOnboardingDraft } from "@/lib/onboardingDraft";

const h = vi.hoisted(() => ({
  signOut: vi.fn(async () => {}),
  profile: null as null | { onboardingComplete?: boolean },
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "setup-test" },
    profile: h.profile,
    signOut: h.signOut,
  }),
}));
vi.mock("@/lib/lifecycleAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/hooks/useAccountDeletionStatus", () => ({
  useAccountDeletionStatus: () => ({ pending: false, completed: false }),
}));
vi.mock("@/components/settings/SecuritySection", () => ({
  default: () => null,
}));
// The real section signs out after its own checks, and catches a failed
// sign-out with a toast; the stub hands the page's signOut straight to a
// button, and swallows the failure the same way.
vi.mock("@/components/settings/AccountSection", () => ({
  default: ({ signOut }: { signOut: () => Promise<void> }) => (
    <button type="button" onClick={() => void signOut().catch(() => {})}>
      Sign out
    </button>
  ),
}));

import SettingsAccount from "../SettingsAccount";
import { track } from "@/lib/lifecycleAnalytics";

const show = (duringSetup: boolean) =>
  render(
    <MemoryRouter>
      <SettingsAccount duringSetup={duringSetup} />
    </MemoryRouter>
  );

// A whole draft, as Onboarding saves it: the loader drops a partial one.
function saveDraftAtStep(step: number) {
  saveOnboardingDraft("setup-test", {
    step,
    primaryGoal: "strength",
    daysPerWeek: 3,
    equipment: "full_gym",
    runFrequency: "regular",
    runMode: "freeform",
    weeklyRunDays: 3,
    raceDistance: "10k",
    raceTargetDate: "",
    injuries: ["none"],
    gender: "male",
    ageRange: "25-34",
    heightCm: 175,
    weightKg: 81.5,
    heightUnit: "cm",
    weightUnit: "kg",
    trainingWhy: "",
    experience: "beginner",
    goalConfirmed: true,
    runConfirmed: true,
    displayName: "Test athlete",
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  h.signOut.mockImplementation(async () => {});
  h.profile = { onboardingComplete: false };
});
afterEach(cleanup);

describe("SettingsAccount — signing out of setup", () => {
  it("reports onboarding_abandoned at the saved step once signed out", async () => {
    saveDraftAtStep(5);
    show(true);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() =>
      expect(track).toHaveBeenCalledWith("onboarding_abandoned", {
        step: "about",
      })
    );
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it("a finished account with a deletion pending is not leaving setup", async () => {
    h.profile = { onboardingComplete: true };
    saveDraftAtStep(5);
    show(true);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    // Anchor: the sign-out itself happened.
    await waitFor(() => expect(h.signOut).toHaveBeenCalledTimes(1));
    expect(track).not.toHaveBeenCalled();
  });

  it("a sign-out that fails reports nothing", async () => {
    h.signOut.mockImplementation(async () => {
      throw new Error("offline");
    });
    saveDraftAtStep(5);
    show(true);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    // Anchor: the sign-out was attempted, and its failure handled.
    await waitFor(() => expect(h.signOut).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(track).not.toHaveBeenCalled();
  });

  it("an ordinary sign-out reports nothing", async () => {
    show(false);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    // Anchor: the sign-out itself happened.
    await waitFor(() => expect(h.signOut).toHaveBeenCalledTimes(1));
    expect(track).not.toHaveBeenCalled();
  });
});
