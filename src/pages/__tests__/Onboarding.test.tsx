import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import Onboarding from "../Onboarding";
import {
  saveOnboardingDraft,
  loadOnboardingDraft,
  type OnboardingDraft,
} from "@/lib/onboardingDraft";
import * as planning from "@/lib/onboardingPlan";
const { complete, refresh } = vi.hoisted(() => ({
  complete: vi.fn(),
  refresh: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "setup-test", email: "test@example.com" },
    refreshProfile: refresh,
  }),
}));
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("firebase/firestore");
vi.mock("firebase/functions", () => ({ httpsCallable: () => complete }));
vi.mock("@/lib/firestoreWrite", () => ({
  setDocGuarded: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/lifecycleAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
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
  displayName: "Test athlete",
};
function LocationProbe() {
  const location = useLocation();
  return (
    <output aria-label="Current route">
      {location.pathname}
      {location.search}
    </output>
  );
}
const open = () =>
  render(
    <MemoryRouter>
      <Onboarding />
      <LocationProbe />
    </MemoryRouter>
  );
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  complete.mockResolvedValue({ data: {} });
});
afterEach(cleanup);
describe("onboarding chapters and commit", () => {
  it("requires goal, running intent and limitations, preserving explicit choices on reload", () => {
    open();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Build muscle/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("region", { name: "Draft week" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Both" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Occasional runner/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "None" }));
    cleanup();
    open();
    expect(screen.getByRole("button", { name: "None" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    expect(complete).not.toHaveBeenCalled();
  });
  it("edits from review and commits the exact rendered plan once, including maintenance nutrition", async () => {
    saveOnboardingDraft("setup-test", draft);
    const builder = vi.spyOn(planning, "buildOnboardingPlan");
    open();
    fireEvent.click(screen.getByRole("button", { name: "Edit lift sessions" }));
    fireEvent.click(screen.getByRole("radio", { name: "5" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to review" }));
    expect(screen.getByText("5 per week")).toBeInTheDocument();
    const preview = builder.mock.results.at(-1)!.value;
    let resolve!: (result: unknown) => void;
    complete.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const commit = screen.getByRole("button", { name: "Create my plan" });
    fireEvent.click(commit);
    fireEvent.click(commit);
    expect(complete).toHaveBeenCalledTimes(1);
    const payload = complete.mock.calls[0][0];
    expect(payload.programState).toBe(preview.programState);
    expect(payload.weekSchedule).toBe(preview.weekSchedule);
    expect(payload.profileData.weeklyRunDaysTarget).toBe(0);
    expect(payload.profileData.goalWeightKg).toBe(81.5);
    expect(payload.profileData.weeklyRateKg).toBe(0);
    resolve({ data: {} });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(loadOnboardingDraft("setup-test", 7)).toBeNull();
    await waitFor(() =>
      expect(screen.getByLabelText("Current route")).toHaveTextContent(
        "/program?tab=lift"
      )
    );
    builder.mockRestore();
  });
  it("shows a recoverable error and retains the intended answers after a failed commit", async () => {
    saveOnboardingDraft("setup-test", draft);
    complete.mockRejectedValue({ code: "functions/permission-denied" });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Create my plan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t save your plan"
    );
    expect(
      screen.getByRole("button", { name: "Try creating my plan again" })
    ).toBeEnabled();
    expect(loadOnboardingDraft("setup-test", 7)?.weightKg).toBe(81.5);
    expect(refresh).not.toHaveBeenCalled();
  });
  it("does not allow a typed past race date to be committed", () => {
    saveOnboardingDraft("setup-test", {
      ...draft,
      runMode: "race_prep",
      raceTargetDate: "2020-01-01",
    });
    open();
    expect(
      screen.getByRole("button", { name: "Create my plan" })
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Edit running" }));
    expect(screen.getByLabelText(/Race target date/)).toHaveAttribute(
      "aria-invalid",
      "true"
    );
  });
});

describe("activity-relevant setup", () => {
  it("creates a genuine free-running-only plan, skips lift setup and opens the Run tab", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Improve running/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("radio", { name: "Running" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(
      screen.queryByRole("radiogroup", { name: "Lift sessions per week" })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: /Occasional runner/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { name: "Start with your numbers" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Equipment access" })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("region", { name: "First run preview" })
    ).toHaveTextContent("Free running");
    expect(
      screen.queryByRole("region", { name: "First lift preview" })
    ).not.toBeInTheDocument();
    const openWeek = screen.getByRole("region", { name: "Your week shape" });
    expect(openWeek).toHaveTextContent("Free running");
    expect(openWeek).not.toHaveTextContent("0 lifts");
    expect(
      within(openWeek).getAllByRole("button", { name: /: open day$/ })
    ).toHaveLength(7);
    expect(
      within(openWeek).queryByRole("button", { name: /: rest$/ })
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(openWeek).getByRole("button", { name: "Mon: open day" })
    );
    expect(openWeek).toHaveTextContent("Mon · Run when it suits you.");
    fireEvent.click(screen.getByRole("button", { name: "Create my plan" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    const payload = complete.mock.calls[0][0];
    expect(payload.programState.workouts).toEqual([]);
    expect(payload.programState.runDays).toEqual([]);
    expect(
      payload.weekSchedule.every((day: { type: string }) => day.type === "rest")
    ).toBe(true);
    expect(payload.profileData).toMatchObject({
      weeklyWorkoutsTarget: 0,
      daysPerWeek: 0,
      runMode: "freeform",
      athleteType: "Runner",
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Current route")).toHaveTextContent(
        "/program?tab=run"
      )
    );
  });
  it("restores the selected lift rhythm when changing activity from review, including reload", () => {
    saveOnboardingDraft("setup-test", {
      ...draft,
      daysPerWeek: 5,
      trainingActivity: "both",
    });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Edit lift sessions" }));
    fireEvent.click(screen.getByRole("radio", { name: "Running" }));
    cleanup();
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Both" }));
    expect(screen.getByRole("radio", { name: "5" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: "Back to review" }));
    expect(screen.getByText("5 per week")).toBeInTheDocument();
  });
  it("keeps a running-first hybrid review on the Run tab while preserving its lifts", async () => {
    saveOnboardingDraft("setup-test", {
      ...draft,
      primaryGoal: "running",
      trainingActivity: "both",
    });
    open();
    expect(
      screen.getByRole("region", { name: "First run preview" })
    ).toHaveTextContent("Free running");
    fireEvent.click(screen.getByRole("button", { name: "Create my plan" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(complete.mock.calls[0][0].programState.workouts).toHaveLength(3);
    await waitFor(() =>
      expect(screen.getByLabelText("Current route")).toHaveTextContent(
        "/program?tab=run"
      )
    );
  });
});

describe("inspect the generated week", () => {
  it("shows the actual exercises after an equipment change in the existing day preview", () => {
    saveOnboardingDraft("setup-test", draft);
    const builder = vi.spyOn(planning, "buildOnboardingPlan");
    open();
    fireEvent.click(screen.getByRole("button", { name: "Edit setup" }));
    const original =
      builder.mock.results.at(-1)!.value.programState.workouts[0];
    fireEvent.click(
      screen.getByRole("button", { name: /Minimal \/ bodyweight/ })
    );
    const updated = builder.mock.results.at(-1)!.value.programState.workouts[0];
    expect(
      updated.exercises.map((exercise: { name: string }) => exercise.name)
    ).not.toEqual(
      original.exercises.map((exercise: { name: string }) => exercise.name)
    );
    fireEvent.click(screen.getByRole("button", { name: /Mon: lift/ }));
    const preview = screen.getByRole("region", { name: "Draft week" });
    expect(
      within(preview).getByRole("heading", { name: updated.dayName })
    ).toBeInTheDocument();
    for (const exercise of updated.exercises)
      expect(within(preview).getByText(exercise.name)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to review" }));
    expect(
      screen.getByRole("region", { name: "First lift preview" })
    ).toHaveTextContent(updated.exercises[0].name);
    builder.mockRestore();
  });
});
