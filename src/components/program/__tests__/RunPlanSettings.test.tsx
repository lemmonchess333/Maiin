import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RunPlanSettings from "../RunPlanSettings";
import type { UserProfile } from "@/lib/auth";

/**
 * Run-Split contract: the dedicated run-plan editor saves RUNNING ONLY.
 * A commit must go through the run writers (updateProfile with a
 * raceGoal/runMode patch + refreshRunSchedule) and must NOT invoke any
 * whole-programme rebuild — that's the whole point of splitting it out.
 */

const baseProfile = {
  runMode: "freeform",
  weeklyWorkoutsTarget: 4,
  weekSchedule: [],
} as unknown as UserProfile;

function renderPage(profile: UserProfile) {
  const updateProfile = vi.fn().mockResolvedValue({ ok: true });
  const refreshRunSchedule = vi.fn().mockResolvedValue(undefined);
  const onOpenFullSettings = vi.fn();
  render(
    <RunPlanSettings
      profile={profile}
      updateProfile={updateProfile}
      refreshRunSchedule={refreshRunSchedule}
      onOpenFullSettings={onOpenFullSettings}
    />
  );
  return { updateProfile, refreshRunSchedule, onOpenFullSettings };
}

describe("RunPlanSettings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows only run controls — no lift/nutrition/equipment fields", () => {
    renderPage(baseProfile);
    expect(screen.getByText("Run mode")).toBeInTheDocument();
    // None of the full-editor groups leak in.
    expect(screen.queryByText(/Nutrition phase/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Equipment access/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Lift days/i)).not.toBeInTheDocument();
  });

  it("reveals the race goal planner only in race prep", () => {
    renderPage(baseProfile);
    expect(screen.queryByText(/Target date/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Race prep/i }));
    expect(screen.getByText(/Target date/i)).toBeInTheDocument();
    expect(screen.getByText(/Run days \/ week/i)).toBeInTheDocument();
  });

  it("saving a race goal writes the run patch + refreshes the schedule", async () => {
    const { updateProfile, refreshRunSchedule } = renderPage(baseProfile);
    fireEvent.click(screen.getByRole("radio", { name: /Race prep/i }));
    // Pick a valid far-future date via the date input.
    const date = screen.getByLabelText(/Target date/i) as HTMLInputElement;
    fireEvent.change(date, { target: { value: "2027-01-01" } });

    const save = await screen.findByRole("button", { name: /Save .*plan/i });
    fireEvent.click(save);

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    const patch = updateProfile.mock.calls[0][0];
    // Run-only patch: materializes runMode + raceGoal, no plan/workouts rebuild.
    expect(patch.runMode).toBe("race_prep");
    expect(patch.raceGoal).toMatchObject({ targetDate: "2027-01-01" });
    expect(refreshRunSchedule).toHaveBeenCalled();
  });

  it("D14: shows the Pgm6 tuning knobs in race prep and persists them on save", async () => {
    const { updateProfile, refreshRunSchedule } = renderPage(baseProfile);
    fireEvent.click(screen.getByRole("radio", { name: /Race prep/i }));

    // Both knobs render (race-prep only).
    expect(screen.getByText("Long-run volume")).toBeInTheDocument();
    expect(screen.getByText("Intensity")).toBeInTheDocument();

    // Pick a valid date + non-default knobs.
    const date = screen.getByLabelText(/Target date/i) as HTMLInputElement;
    fireEvent.change(date, { target: { value: "2027-01-01" } });
    fireEvent.click(screen.getByRole("radio", { name: "Lighter" }));
    fireEvent.click(screen.getByRole("radio", { name: "Gentler" }));

    const save = await screen.findByRole("button", { name: /Save .*plan/i });
    fireEvent.click(save);

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    const patch = updateProfile.mock.calls[0][0];
    // Knobs persist alongside the goal (4-gate profile fields).
    expect(patch.runVolume).toBe("lighter");
    expect(patch.runDifficulty).toBe("gentler");
    // And thread through the refresh explicitly (stale-closure guard).
    expect(refreshRunSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        tuning: { volume: "lighter", difficulty: "gentler" },
      })
    );
  });

  it("D14: knobs hidden in freeform (nothing scheduled to tune)", () => {
    renderPage(baseProfile);
    expect(screen.queryByText("Long-run volume")).not.toBeInTheDocument();
    expect(screen.queryByText("Intensity")).not.toBeInTheDocument();
  });

  it("switching to freeform clears the race goal (runMode + null goal)", async () => {
    const raceProfile = {
      ...baseProfile,
      runMode: "race_prep",
      raceGoal: { distance: "marathon", targetDate: "2027-01-01" },
    } as unknown as UserProfile;
    const { updateProfile } = renderPage(raceProfile);
    fireEvent.click(screen.getByRole("radio", { name: /Freeform/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Save/i }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    const patch = updateProfile.mock.calls[0][0];
    expect(patch.runMode).toBe("freeform");
    expect(patch.raceGoal).toBeNull();
  });
});
