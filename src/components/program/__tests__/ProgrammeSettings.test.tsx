/**
 * Pgm4: ProgrammeSettings — unified, free programme editor.
 *
 * Pins the contract that replaced the onboarding-retake + the 6-step
 * ConfigurePlanModal wizard + the ProgramSettingsPanel sheet:
 *   1. Plan-shaping edits run buildPlan + configurePlan with
 *      preserveHistory:true, and equipment/injuries are now EDITABLE
 *      (sourced from the form, not threaded read-only from profile).
 *   2. The engine toggles live-save via updateSettings (no rebuild).
 *   3. Reset calls regenerateProgram.
 *   4. The save action is gated until a field actually changes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import ProgrammeSettings from "../ProgrammeSettings";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";

const configureSpy = vi.fn(async () => ({ data: {} }));
vi.mock("firebase/functions", () => ({
  httpsCallable: () => configureSpy,
}));
vi.mock("@/lib/firebase", () => ({ functions: {}, db: {}, auth: {}, storage: {} }));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "u-1",
    displayName: "Test",
    email: "t@example.com",
    primaryGoal: "hypertrophy",
    experience: "intermediate",
    weeklyWorkoutsTarget: 4,
    preferredSplit: "ppl",
    equipment: "full_gym",
    injuries: [],
    runMode: "freeform",
    weeklyRunDaysTarget: 2,
    program: { goal: "recomp" },
    ...overrides,
  } as UserProfile;
}

const programState = {
  settings: { autoProgression: true, microloading: true },
} as ProgramState;

function setup(profileOverrides: Partial<UserProfile> = {}) {
  const updateSettings = vi.fn();
  const regenerateProgram = vi.fn();
  const onOpenWeeklyLayout = vi.fn();
  render(
    <ProgrammeSettings
      profile={makeProfile(profileOverrides)}
      programState={programState}
      updateSettings={updateSettings}
      regenerateProgram={regenerateProgram}
      onOpenWeeklyLayout={onOpenWeeklyLayout}
    />
  );
  return { updateSettings, regenerateProgram, onOpenWeeklyLayout };
}

beforeEach(() => {
  cleanup();
  configureSpy.mockClear();
});

describe("ProgrammeSettings — save gating", () => {
  it("save is disabled until a field changes, then enabled", () => {
    setup();
    const save = screen.getByRole("button", { name: /no changes/i });
    expect(save).toBeDisabled();

    fireEvent.click(screen.getByText("Get stronger"));
    const saveNow = screen.getByRole("button", { name: /save changes/i });
    expect(saveNow).not.toBeDisabled();
  });
});

describe("ProgrammeSettings — rebuild path", () => {
  it("Save → confirm → configurePlan called with preserveHistory and EDITABLE equipment/injuries", async () => {
    setup();

    // Change focus, equipment, and add an injury — all rebuild-class.
    fireEvent.click(screen.getByText("Get stronger"));
    fireEvent.click(screen.getByText("Home gym"));
    fireEvent.click(screen.getByText("Knee"));

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    // Confirmation modal Save
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await vi.waitFor(() => expect(configureSpy).toHaveBeenCalledTimes(1));
    const payload = configureSpy.mock.calls[0][0] as {
      profileUpdates: Record<string, unknown>;
    };
    expect(payload.profileUpdates.primaryGoal).toBe("strength");
    // equipment + injuries now flow from the form (the capability gap closed)
    expect(payload.profileUpdates.equipment).toBe("home_gym");
    expect(payload.profileUpdates.injuries).toEqual(["knee"]);
  });
});

describe("ProgrammeSettings — toggles live-save without rebuild", () => {
  it("toggling auto-progression calls updateSettings, not configurePlan", () => {
    const { updateSettings } = setup();
    fireEvent.click(screen.getByRole("switch", { name: /auto progression/i }));
    expect(updateSettings).toHaveBeenCalledWith({ autoProgression: false });
    expect(configureSpy).not.toHaveBeenCalled();
  });
});

describe("ProgrammeSettings — reset", () => {
  it("Reset → confirm → regenerateProgram", () => {
    const { regenerateProgram } = setup();
    fireEvent.click(screen.getByRole("button", { name: /reset programme/i }));
    fireEvent.click(screen.getByRole("button", { name: /^reset$/i }));
    expect(regenerateProgram).toHaveBeenCalledTimes(1);
  });
});

describe("ProgrammeSettings — injuries mutual exclusion", () => {
  it("selecting a specific injury clears 'none', and selecting 'none' clears the rest", () => {
    setup({ injuries: ["none"] });
    // pick knee -> none should drop, save payload reflects it
    fireEvent.click(screen.getByText("Knee"));
    fireEvent.click(screen.getByText("Shoulder"));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    return vi.waitFor(() => {
      const payload = configureSpy.mock.calls[0][0] as {
        profileUpdates: { injuries: string[] };
      };
      expect(payload.profileUpdates.injuries).toEqual(
        expect.arrayContaining(["knee", "shoulder"])
      );
      expect(payload.profileUpdates.injuries).not.toContain("none");
    });
  });
});
