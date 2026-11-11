/**
 * Setup takes the name Apple shares when it lands (survey 22).
 *
 * Apple's name is set on the account just after the account is made, and
 * setup can open first, with no name to start from and a Hide My Email
 * address it must not use. The name is taken when it arrives, unless the
 * person has typed one of their own.
 */
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: null as { displayName?: string } | null,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: {
      uid: "apple-new",
      email: "k7x9qzp2m@privaterelay.appleid.com",
      displayName: null,
      providerData: [{ providerId: "apple.com" }],
    },
    profile: h.profile,
    refreshProfile: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn(),
  }),
}));
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("firebase/firestore");
vi.mock("firebase/functions", () => ({ httpsCallable: () => vi.fn() }));
vi.mock("@/lib/firestoreWrite", () => ({
  setDocGuarded: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/lifecycleAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import Onboarding from "../Onboarding";
import {
  saveOnboardingDraft,
  type OnboardingDraft,
} from "@/lib/onboardingDraft";

/** Every answer given, at the review, with no name chosen yet. */
const draft: OnboardingDraft = {
  step: 7,
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
};

const show = () => (
  <MemoryRouter>
    <Onboarding />
  </MemoryRouter>
);
const nameField = () =>
  screen.getByLabelText("Your public display name") as HTMLInputElement;

beforeEach(() => {
  localStorage.clear();
  h.profile = null;
  saveOnboardingDraft("apple-new", draft);
});
afterEach(cleanup);

describe("the name Apple shares, arriving after setup opens", () => {
  it("is taken when it lands, never the relay address", () => {
    const view = render(show());
    expect(nameField().value).toBe("");
    h.profile = { displayName: "Sam Jones" };
    view.rerender(show());
    expect(nameField().value).toBe("Sam Jones");
  });

  it("is taken over a draft that holds only the old default", () => {
    // Setup used to start a name-less account on "Athlete", and saved it
    // into the draft on the first answer; that was never the person's.
    saveOnboardingDraft("apple-new", { ...draft, displayName: "Athlete" });
    const view = render(show());
    expect(nameField().value).toBe("");
    h.profile = { displayName: "Sam Jones" };
    view.rerender(show());
    expect(nameField().value).toBe("Sam Jones");
  });

  it("leaves a name the person typed", () => {
    const view = render(show());
    fireEvent.change(nameField(), { target: { value: "Sammy" } });
    h.profile = { displayName: "Sam Jones" };
    view.rerender(show());
    expect(nameField().value).toBe("Sammy");
  });
});
