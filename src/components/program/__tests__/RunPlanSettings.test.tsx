import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RunPlanSettings from "../RunPlanSettings";
import { upcomingRaceSpaceDefs } from "@/features/spaces/spaceDefs";
import { localDateString } from "@/lib/dateHelpers";
import { generateSchedule } from "@/lib/scheduleUtils";
import type { UserProfile } from "@/lib/auth";

/**
 * Run-Split contract, rebuilt for RUN-EV-02 (owner decision, P0): the
 * dedicated run-plan editor saves through ONE current-draft buildPlan
 * computation and ONE atomic configurePlan commit. These tests read the
 * callable payload — profileUpdates + programState + weekSchedule land
 * together or not at all — so they pin the coherence the old two-write
 * path could not: targets, schedule slots, plan rows and the goal all
 * derive from the same draft.
 *
 * Races plan PR3's two doors (deep-link + catalogue picker) still write
 * the same raceGoal + eventSpaceId — now inside profileUpdates.
 */

const configureSpy = vi.fn(async (..._args: unknown[]) => ({ data: {} }));
vi.mock("firebase/functions", () => ({
  httpsCallable: () => configureSpy,
}));
vi.mock("@/lib/firebase", () => ({
  functions: {},
  db: {},
  auth: {},
  storage: {},
}));

const baseProfile = {
  runMode: "freeform",
  weeklyWorkoutsTarget: 4,
  primaryGoal: "hypertrophy",
  experience: "intermediate",
  equipment: "full_gym",
  injuries: [],
  weekSchedule: [],
  program: { goal: "recomp" },
} as unknown as UserProfile;

function renderPage(profile: UserProfile, path = "/settings/run-plan") {
  const refreshProfile = vi.fn().mockResolvedValue(undefined);
  const onOpenFullSettings = vi.fn();
  render(
    <MemoryRouter initialEntries={[path]}>
      <RunPlanSettings
        profile={profile}
        programState={null}
        refreshProfile={refreshProfile}
        onOpenFullSettings={onOpenFullSettings}
      />
    </MemoryRouter>
  );
  return { refreshProfile, onOpenFullSettings };
}

type ConfigurePayload = {
  profileUpdates: Record<string, unknown> & {
    raceGoal?: Record<string, unknown> | null;
  };
  programState: { runDays?: { date: string }[]; runPlan?: unknown };
  weekSchedule: { day: number; type: string }[];
};

function sentPayload(): ConfigurePayload {
  expect(configureSpy).toHaveBeenCalledTimes(1);
  return configureSpy.mock.calls[0][0] as ConfigurePayload;
}

/** First upcoming catalogue race — read from config so the test never
 *  goes stale as dateKeys are pasted forward each edition. */
function firstUpcomingRace() {
  const races = upcomingRaceSpaceDefs(localDateString());
  expect(races.length).toBeGreaterThan(0);
  return races[0];
}

describe("RunPlanSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureSpy.mockClear();
  });

  it("shows only run controls — no lift/nutrition/equipment fields", () => {
    renderPage(baseProfile);
    expect(screen.getByText("Run mode")).toBeInTheDocument();
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

  it("saving a race goal commits ONE atomic payload with mode, goal and plan together", async () => {
    const { refreshProfile } = renderPage(baseProfile);
    fireEvent.click(screen.getByRole("radio", { name: /Race prep/i }));
    const date = screen.getByLabelText(/Target date/i) as HTMLInputElement;
    fireEvent.change(date, { target: { value: "2027-01-01" } });

    const save = await screen.findByRole("button", { name: /Save .*plan/i });
    fireEvent.click(save);

    await waitFor(() => expect(configureSpy).toHaveBeenCalledTimes(1));
    const payload = sentPayload();
    expect(payload.profileUpdates.runMode).toBe("race_prep");
    expect(payload.profileUpdates.raceGoal).toMatchObject({
      targetDate: "2027-01-01",
    });
    // Blank event name → the key is OMITTED (never undefined/empty string).
    expect("eventName" in payload.profileUpdates.raceGoal!).toBe(false);
    // The plan itself travels in the same call — no second write to lose.
    expect(payload.programState.runDays?.length ?? 0).toBeGreaterThan(0);
    expect(payload.weekSchedule).toHaveLength(7);
    await waitFor(() => expect(refreshProfile).toHaveBeenCalledTimes(1));
  });

  it("RUN-EV-02: a 2→4 run-day change moves slots, rows and targets TOGETHER", async () => {
    // Saved baseline says 2 run days; the draft raises it to 4.
    const profile = {
      ...baseProfile,
      weeklyRunDaysTarget: 2,
      weeklyRunsTarget: 2,
    } as unknown as UserProfile;
    renderPage(profile);
    fireEvent.click(screen.getByRole("radio", { name: /Race prep/i }));
    const date = screen.getByLabelText(/Target date/i) as HTMLInputElement;
    fireEvent.change(date, { target: { value: "2027-01-01" } });
    // 2 → 4 via the stepper.
    const plus = screen.getByRole("button", { name: /Increase run days/i });
    fireEvent.click(plus);
    fireEvent.click(plus);

    fireEvent.click(
      await screen.findByRole("button", { name: /Save .*plan/i })
    );
    await waitFor(() => expect(configureSpy).toHaveBeenCalledTimes(1));
    const payload = sentPayload();

    // The adherence denominator…
    expect(payload.profileUpdates.weeklyRunDaysTarget).toBe(4);
    expect(payload.profileUpdates.weeklyRunsTarget).toBe(4);
    // …the actual schedule slots…
    const runSlots = payload.weekSchedule.filter(
      (d) => d.type === "run" || d.type === "both"
    ).length;
    expect(runSlots).toBe(4);
    // …and the materialized first week's rows — four distinct dates, from
    // the same derivation. Pre-fix the schedule kept the profile's stale
    // slots and the plan emitted 2 rows against a target of 4.
    const firstWeekDates = new Set(
      (payload.programState.runDays ?? []).slice(0, 4).map((r) => r.date)
    );
    expect(firstWeekDates.size).toBe(4);
  });

  it("RUN-EV-02: preview ≡ commit — the committed weekSchedule IS the planner's derivation", async () => {
    renderPage(baseProfile);
    fireEvent.click(screen.getByRole("radio", { name: /Race prep/i }));
    const date = screen.getByLabelText(/Target date/i) as HTMLInputElement;
    fireEvent.change(date, { target: { value: "2027-01-01" } });
    fireEvent.click(
      await screen.findByRole("button", { name: /Save .*plan/i })
    );
    await waitFor(() => expect(configureSpy).toHaveBeenCalledTimes(1));
    // raceGoalPlanner previews from generateSchedule(liftDays, runDays);
    // the commit must be byte-equal to that same derivation — not the
    // stored profile.weekSchedule the old path passed (draft default: 3
    // run days, saved liftDays 4).
    expect(sentPayload().weekSchedule).toEqual(generateSchedule(4, 3));
  });

  it("RACE-EVENT-IDENTITY-01: saving with an event name includes it in the raceGoal", async () => {
    renderPage(baseProfile);
    fireEvent.click(screen.getByRole("radio", { name: /Race prep/i }));

    const date = screen.getByLabelText(/Target date/i) as HTMLInputElement;
    fireEvent.change(date, { target: { value: "2027-01-01" } });
    const name = screen.getByLabelText(
      /Event name \(optional\)/i
    ) as HTMLInputElement;
    // Trailing whitespace pins the .trim() on save.
    fireEvent.change(name, { target: { value: "  London Marathon 2027  " } });

    fireEvent.click(
      await screen.findByRole("button", { name: /Save .*plan/i })
    );
    await waitFor(() => expect(configureSpy).toHaveBeenCalledTimes(1));
    expect(sentPayload().profileUpdates.raceGoal).toEqual({
      distance: "10k",
      targetDate: "2027-01-01",
      eventName: "London Marathon 2027",
    });
  });

  it("D14: shows the Pgm6 tuning knobs in race prep and persists them on save", async () => {
    renderPage(baseProfile);
    fireEvent.click(screen.getByRole("radio", { name: /Race prep/i }));

    expect(screen.getByText("Long-run volume")).toBeInTheDocument();
    expect(screen.getByText("Intensity")).toBeInTheDocument();

    const date = screen.getByLabelText(/Target date/i) as HTMLInputElement;
    fireEvent.change(date, { target: { value: "2027-01-01" } });
    fireEvent.click(screen.getByRole("radio", { name: "Lighter" }));
    fireEvent.click(screen.getByRole("radio", { name: "Gentler" }));

    fireEvent.click(
      await screen.findByRole("button", { name: /Save .*plan/i })
    );
    await waitFor(() => expect(configureSpy).toHaveBeenCalledTimes(1));
    const payload = sentPayload();
    // Knobs persist in the SAME payload the plan derives from — the
    // profile copy and the generated plan cannot disagree.
    expect(payload.profileUpdates.runVolume).toBe("lighter");
    expect(payload.profileUpdates.runDifficulty).toBe("gentler");
  });

  it("D14: knobs hidden in freeform (nothing scheduled to tune)", () => {
    renderPage(baseProfile);
    expect(screen.queryByText("Long-run volume")).not.toBeInTheDocument();
    expect(screen.queryByText("Intensity")).not.toBeInTheDocument();
  });

  it("switching to freeform clears the goal AND zeroes the run targets atomically", async () => {
    const raceProfile = {
      ...baseProfile,
      runMode: "race_prep",
      weeklyRunDaysTarget: 3,
      weeklyRunsTarget: 3,
      raceGoal: { distance: "marathon", targetDate: "2027-01-01" },
    } as unknown as UserProfile;
    renderPage(raceProfile);
    fireEvent.click(screen.getByRole("radio", { name: /Freeform/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Save/i }));
    await waitFor(() => expect(configureSpy).toHaveBeenCalledTimes(1));
    const payload = sentPayload();
    expect(payload.profileUpdates.runMode).toBe("freeform");
    // Explicit null — the CF sanitizer preserves it; the old path cleared
    // the goal but left targets and the stale plan untouched.
    expect(payload.profileUpdates.raceGoal).toBeNull();
    expect(payload.profileUpdates.weeklyRunDaysTarget).toBe(0);
    expect(payload.profileUpdates.weeklyRunsTarget).toBe(0);
    // The stale runDays clear in the SAME commit.
    expect(payload.programState.runDays ?? []).toHaveLength(0);
  });

  it("A2: a goal time rides the raceGoal and shows the feasibility register", async () => {
    // Confirmed benchmark → the verdict line renders as the user types.
    const profile = {
      ...baseProfile,
      runFitness: {
        benchmark: { distanceM: 5000, timeS: 1200 },
        vdot: 49.8,
        source: "manual",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    } as unknown as UserProfile;
    renderPage(profile);
    fireEvent.click(screen.getByRole("radio", { name: /Race prep/i }));
    const date = screen.getByLabelText(/Target date/i) as HTMLInputElement;
    fireEvent.change(date, { target: { value: "2027-01-01" } });
    const time = screen.getByLabelText(/Goal time \(optional\)/i);
    fireEvent.change(time, { target: { value: "19:30" } });

    // Honest register, on screen.
    expect(
      await screen.findByText(/Tropos estimate, not a promise/i)
    ).toBeInTheDocument();

    fireEvent.click(
      await screen.findByRole("button", { name: /Save .*plan/i })
    );
    await waitFor(() => expect(configureSpy).toHaveBeenCalledTimes(1));
    expect(sentPayload().profileUpdates.raceGoal).toMatchObject({
      targetTimeS: 19 * 60 + 30,
    });
  });

  it("A2: a malformed goal time blocks the save with a hint; empty stays absent", async () => {
    renderPage(baseProfile);
    fireEvent.click(screen.getByRole("radio", { name: /Race prep/i }));
    const date = screen.getByLabelText(/Target date/i) as HTMLInputElement;
    fireEvent.change(date, { target: { value: "2027-01-01" } });
    const time = screen.getByLabelText(/Goal time \(optional\)/i);
    fireEvent.change(time, { target: { value: "abc" } });
    expect(screen.getByText(/Enter a time like/i)).toBeInTheDocument();
    // Clear it — save proceeds and the key is OMITTED.
    fireEvent.change(time, { target: { value: "" } });
    fireEvent.click(
      await screen.findByRole("button", { name: /Save .*plan/i })
    );
    await waitFor(() => expect(configureSpy).toHaveBeenCalledTimes(1));
    expect(
      "targetTimeS" in sentPayload().profileUpdates.raceGoal!
    ).toBe(false);
  });

  it("Door 1: a valid deep-link seeds race prep and saves the eventSpaceId binding", async () => {
    const race = firstUpcomingRace();
    renderPage(
      baseProfile,
      `/settings/run-plan?distance=${race.event!.distance}&date=${
        race.event!.dateKey
      }&eventName=${encodeURIComponent(race.name)}&spaceId=${race.id}`
    );

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
    await waitFor(() => expect(configureSpy).toHaveBeenCalledTimes(1));
    expect(sentPayload().profileUpdates.raceGoal).toEqual({
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
    expect(screen.getByRole("radio", { name: /Freeform/i })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("Door 2: picking a catalogue race prefills the draft and saves the binding", async () => {
    const race = firstUpcomingRace();
    renderPage(baseProfile);
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
    await waitFor(() => expect(configureSpy).toHaveBeenCalledTimes(1));
    const goal = sentPayload().profileUpdates.raceGoal!;
    expect(goal.eventSpaceId).toBe(race.id);
    expect(goal.targetDate).toBe(race.event!.dateKey);
  });

  it("a manual date edit after picking clears the eventSpaceId binding", async () => {
    const race = firstUpcomingRace();
    renderPage(baseProfile);
    fireEvent.click(screen.getByRole("radio", { name: /Race prep/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Choose an upcoming race/i })
    );
    fireEvent.click(
      screen.getByRole("option", { name: new RegExp(race.name) })
    );

    const date = screen.getByLabelText(/Target date/i) as HTMLInputElement;
    fireEvent.change(date, { target: { value: "2028-01-01" } });

    fireEvent.click(
      await screen.findByRole("button", { name: /Save .*plan/i })
    );
    await waitFor(() => expect(configureSpy).toHaveBeenCalledTimes(1));
    const goal = sentPayload().profileUpdates.raceGoal!;
    expect("eventSpaceId" in goal).toBe(false);
    expect(goal.targetDate).toBe("2028-01-01");
  });
});
