import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RunPlanSettings from "../RunPlanSettings";
import { upcomingRaceSpaceDefs } from "@/features/spaces/spaceDefs";
import { localDateString } from "@/lib/dateHelpers";
import type { UserProfile } from "@/lib/auth";

/**
 * Run-Split contract: the dedicated run-plan editor saves RUNNING ONLY.
 * A commit must go through the run writers (updateProfile with a
 * raceGoal/runMode patch + refreshRunSchedule) and must NOT invoke any
 * whole-programme rebuild — that's the whole point of splitting it out.
 *
 * Races plan PR3 adds the two doors: the ?distance&date&eventName&spaceId
 * deep-link (Door 1) and the catalogue picker (Door 2), both writing the
 * same raceGoal + eventSpaceId patch.
 */

const baseProfile = {
  runMode: "freeform",
  weeklyWorkoutsTarget: 4,
  weekSchedule: [],
} as unknown as UserProfile;

function renderPage(profile: UserProfile, path = "/settings/run-plan") {
  const updateProfile = vi.fn().mockResolvedValue({ ok: true });
  const refreshRunSchedule = vi.fn().mockResolvedValue(undefined);
  const onOpenFullSettings = vi.fn();
  render(
    <MemoryRouter initialEntries={[path]}>
      <RunPlanSettings
        profile={profile}
        updateProfile={updateProfile}
        refreshRunSchedule={refreshRunSchedule}
        onOpenFullSettings={onOpenFullSettings}
      />
    </MemoryRouter>
  );
  return { updateProfile, refreshRunSchedule, onOpenFullSettings };
}

/** First upcoming catalogue race — read from config so the test never
 *  goes stale as dateKeys are pasted forward each edition. */
function firstUpcomingRace() {
  const races = upcomingRaceSpaceDefs(localDateString());
  expect(races.length).toBeGreaterThan(0);
  return races[0];
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
    // Blank event name → the key is OMITTED (never undefined/empty string).
    expect("eventName" in patch.raceGoal).toBe(false);
    expect(refreshRunSchedule).toHaveBeenCalled();
  });

  it("RACE-EVENT-IDENTITY-01: saving with an event name includes it in the raceGoal patch", async () => {
    const { updateProfile } = renderPage(baseProfile);
    fireEvent.click(screen.getByRole("radio", { name: /Race prep/i }));

    const date = screen.getByLabelText(/Target date/i) as HTMLInputElement;
    fireEvent.change(date, { target: { value: "2027-01-01" } });
    const name = screen.getByLabelText(
      /Event name \(optional\)/i
    ) as HTMLInputElement;
    // Trailing whitespace pins the .trim() on save.
    fireEvent.change(name, { target: { value: "  London Marathon 2027  " } });

    const save = await screen.findByRole("button", { name: /Save .*plan/i });
    fireEvent.click(save);

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    const patch = updateProfile.mock.calls[0][0];
    expect(patch.raceGoal).toEqual({
      distance: "10k",
      targetDate: "2027-01-01",
      eventName: "London Marathon 2027",
    });
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

  it("Door 1: a valid deep-link seeds race prep and saves the eventSpaceId binding", async () => {
    const race = firstUpcomingRace();
    const { updateProfile } = renderPage(
      baseProfile,
      `/settings/run-plan?distance=${race.event!.distance}&date=${
        race.event!.dateKey
      }&eventName=${encodeURIComponent(race.name)}&spaceId=${race.id}`
    );

    // Draft is seeded: race prep active, fields prefilled, save offered.
    expect(screen.getByRole("radio", { name: /Race prep/i })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(
      (screen.getByLabelText(/Target date/i) as HTMLInputElement).value
    ).toBe(race.event!.dateKey);
    expect(
      (screen.getByLabelText(/Event name/i) as HTMLInputElement).value
    ).toBe(race.name);

    fireEvent.click(
      await screen.findByRole("button", { name: /Save .*plan/i })
    );
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    const patch = updateProfile.mock.calls[0][0];
    expect(patch.raceGoal).toEqual({
      distance: race.event!.distance,
      targetDate: race.event!.dateKey,
      eventName: race.name,
      eventSpaceId: race.id,
    });
  });

  it("Door 1: a past-dated deep-link is ignored wholesale", () => {
    renderPage(
      baseProfile,
      "/settings/run-plan?distance=half&date=2020-01-01&spaceId=the-big-half"
    );
    // Still the saved freeform baseline — no half-seeded draft.
    expect(screen.getByRole("radio", { name: /Freeform/i })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("Door 2: picking a catalogue race prefills the draft and saves the binding", async () => {
    const race = firstUpcomingRace();
    const { updateProfile } = renderPage(baseProfile);
    fireEvent.click(screen.getByRole("radio", { name: /Race prep/i }));

    fireEvent.click(
      screen.getByRole("button", { name: /Choose an upcoming race/i })
    );
    fireEvent.click(
      screen.getByRole("option", { name: new RegExp(race.name) })
    );

    expect(
      (screen.getByLabelText(/Target date/i) as HTMLInputElement).value
    ).toBe(race.event!.dateKey);
    expect(
      (screen.getByLabelText(/Event name/i) as HTMLInputElement).value
    ).toBe(race.name);

    fireEvent.click(
      await screen.findByRole("button", { name: /Save .*plan/i })
    );
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    const patch = updateProfile.mock.calls[0][0];
    expect(patch.raceGoal.eventSpaceId).toBe(race.id);
    expect(patch.raceGoal.targetDate).toBe(race.event!.dateKey);
  });

  it("a manual date edit after picking clears the eventSpaceId binding", async () => {
    const race = firstUpcomingRace();
    const { updateProfile } = renderPage(baseProfile);
    fireEvent.click(screen.getByRole("radio", { name: /Race prep/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Choose an upcoming race/i })
    );
    fireEvent.click(
      screen.getByRole("option", { name: new RegExp(race.name) })
    );

    // The goal is no longer that event once the date moves.
    const date = screen.getByLabelText(/Target date/i) as HTMLInputElement;
    fireEvent.change(date, { target: { value: "2028-01-01" } });

    fireEvent.click(
      await screen.findByRole("button", { name: /Save .*plan/i })
    );
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    const patch = updateProfile.mock.calls[0][0];
    expect("eventSpaceId" in patch.raceGoal).toBe(false);
    expect(patch.raceGoal.targetDate).toBe("2028-01-01");
  });
});
