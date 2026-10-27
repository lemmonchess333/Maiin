/**
 * Setup's one optional reminder ask (Mob1 call 3): a row on the review
 * that previews the first session it would name, asks the phone for
 * permission only when it is turned on, and is written for the reminders
 * to read only when it was.
 */
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  complete: vi.fn(),
  refresh: vi.fn(),
  request: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "setup-test", email: "test@example.com" },
    refreshProfile: h.refresh,
  }),
}));
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("firebase/firestore");
vi.mock("firebase/functions", () => ({ httpsCallable: () => h.complete }));
vi.mock("@/lib/firestoreWrite", () => ({
  setDocGuarded: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notifications", () => ({
  requestNotificationPermission: h.request,
}));
vi.mock("@/lib/lifecycleAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import Onboarding from "../Onboarding";
import { setDocGuarded } from "@/lib/firestoreWrite";
import {
  loadOnboardingDraft,
  saveOnboardingDraft,
  type OnboardingDraft,
} from "@/lib/onboardingDraft";
import { SETUP_REMINDER_LABEL } from "@/components/onboarding/SetupReminderRow";

/** A lifter at the review: every day off rest is a lift day. */
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
  ageRange: "25-34",
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

const open = () =>
  render(
    <MemoryRouter>
      <Onboarding />
    </MemoryRouter>
  );
const row = () => screen.getByRole("region", { name: "Training-day reminder" });
const reminderSwitch = () =>
  screen.getByRole("switch", { name: SETUP_REMINDER_LABEL });
const startMyPlan = async () => {
  const start = screen.getByRole("button", { name: "Start my plan" });
  await waitFor(() => expect(start).toBeEnabled());
  fireEvent.click(start);
};
const reminderWrites = () =>
  vi
    .mocked(setDocGuarded)
    .mock.calls.filter(([ref]) =>
      String((ref as { path?: string }).path).endsWith(
        "settings/workoutReminders"
      )
    );

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  h.complete.mockResolvedValue({ data: {} });
  h.refresh.mockResolvedValue(undefined);
  h.request.mockResolvedValue(true);
  saveOnboardingDraft("setup-test", draft);
});
afterEach(cleanup);

describe("setup's reminder row", () => {
  it("previews the first lift by name, at 07:30", () => {
    open();
    const firstLift = within(
      screen.getByRole("region", { name: "First lift preview" })
    ).getByRole("heading").textContent!;
    expect(firstLift).toBeTruthy();
    expect(reminderSwitch()).toHaveAttribute("aria-checked", "false");
    expect(
      within(row()).getByText((_, el) =>
        new RegExp(
          `^${firstLift} (today|tomorrow|on [A-Z][a-z]+day) at 07:30$`
        ).test(el?.textContent ?? "")
      )
    ).toBeInTheDocument();
  });

  it("left off, asks nothing and writes no reminder", async () => {
    open();
    await startMyPlan();
    await waitFor(() => expect(h.refresh).toHaveBeenCalledTimes(1));
    // Anchor: the public profile seed after it has been written.
    await waitFor(() => expect(setDocGuarded).toHaveBeenCalled());
    expect(h.request).not.toHaveBeenCalled();
    expect(reminderWrites()).toEqual([]);
  });

  it("turned on, asks for permission then, and saves the reminder at its time", async () => {
    open();
    expect(h.request).not.toHaveBeenCalled();
    fireEvent.click(reminderSwitch());
    await waitFor(() =>
      expect(reminderSwitch()).toHaveAttribute("aria-checked", "true")
    );
    expect(h.request).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Reminder time"), {
      target: { value: "18:15" },
    });
    expect(
      within(row()).getByText((_, el) =>
        / at 18:15$/.test(el?.tagName === "P" ? (el.textContent ?? "") : "")
      )
    ).toBeInTheDocument();
    // A reload on the review keeps the answer.
    expect(loadOnboardingDraft("setup-test", 7)).toMatchObject({
      reminderOn: true,
      reminderTime: "18:15",
    });

    await startMyPlan();
    await waitFor(() => expect(reminderWrites()).toHaveLength(1));
    expect(reminderWrites()[0][1]).toEqual({ enabled: true, time: "18:15" });
    // Written before the app moves on, so the reminders find it.
    expect(vi.mocked(setDocGuarded).mock.invocationCallOrder[0]).toBeLessThan(
      h.refresh.mock.invocationCallOrder[0]
    );
  });

  it("stays off and says where to allow it when the phone refuses", async () => {
    h.request.mockResolvedValue(false);
    open();
    fireEvent.click(reminderSwitch());
    expect(
      await within(row()).findByText(/^Notifications are off for Tropos/)
    ).toBeInTheDocument();
    expect(reminderSwitch()).toHaveAttribute("aria-checked", "false");
    await startMyPlan();
    await waitFor(() => expect(h.refresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(setDocGuarded).toHaveBeenCalled());
    expect(reminderWrites()).toEqual([]);
  });
});
