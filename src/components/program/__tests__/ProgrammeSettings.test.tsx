/**
 * Pgm4: ProgrammeSettings — the free programme editor, in two views.
 *
 * Pins the contract that replaced the onboarding-retake + the 6-step
 * ConfigurePlanModal wizard + the ProgramSettingsPanel sheet:
 *   1. Plan-shaping edits run buildPlan + configurePlan with
 *      preserveHistory:true, and equipment/injuries are now EDITABLE
 *      (sourced from the form, not threaded read-only from profile).
 *   2. The engine toggles live-save via updateSettings (no rebuild).
 *   3. Reset calls regenerateProgram.
 *   4. The save action is gated until a field actually changes.
 *   5. Neither save nor reset runs before the programme has loaded
 *      (`readiness`), since both are built on it.
 *
 * The lifting fields live in ONE view ("lift": Settings → Lift plan). The
 * Programme page ("overview") shows the setup, opens each part's own page
 * and holds the reset; it edits nothing (the owner's call, Settings pass).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
  act,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import ProgrammeSettings from "../ProgrammeSettings";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";
import type { ProgramReadiness } from "@/features/program/useProgram";

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
  settings: { autoProgression: true, smallPlates: false },
} as ProgramState;

/** Where the page sent the user. */
function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

/** What `useProgram` hands the page; by default the programme has loaded. */
type Programme = {
  readiness?: ProgramReadiness;
  programState?: ProgramState | null;
};

function setup(
  profileOverrides: Partial<UserProfile> = {},
  variant: "overview" | "lift" = "lift",
  stateOverride?: ProgramState,
  programme: Programme = {}
) {
  const updateSettings = vi.fn();
  const regenerateProgram = vi.fn();
  const onOpenWeeklyLayout = vi.fn();
  const refreshProfile = vi.fn().mockResolvedValue(undefined);
  const profile = makeProfile(profileOverrides);
  const page = ({
    readiness = "ready",
    programState: loaded = stateOverride ?? programState,
  }: Programme) => (
    <MemoryRouter>
      <ProgrammeSettings
        variant={variant}
        profile={profile}
        programState={loaded}
        readiness={readiness}
        updateSettings={updateSettings}
        regenerateProgram={regenerateProgram}
        refreshProfile={refreshProfile}
        onOpenWeeklyLayout={onOpenWeeklyLayout}
      />
      <LocationProbe />
    </MemoryRouter>
  );
  const { rerender } = render(page(programme));
  return {
    updateSettings,
    regenerateProgram,
    refreshProfile,
    onOpenWeeklyLayout,
    /** The programme arrives, as `useProgram` re-renders the page with it. */
    load: (next: Programme) => rerender(page(next)),
  };
}

beforeEach(() => {
  cleanup();
  configureSpy.mockClear();
});

describe("ProgrammeSettings — lift variant (Section-Split)", () => {
  it("shows lifting controls but hides nutrition, running and reset", () => {
    setup({}, "lift");
    // Lifting-shaping controls are present.
    expect(screen.getByText("Training focus")).toBeInTheDocument();
    expect(screen.getByText("Lift days per week")).toBeInTheDocument();
    expect(screen.getByText("Equipment access")).toBeInTheDocument();
    expect(screen.getByText("Injuries")).toBeInTheDocument();
    // Out-of-scope sections are gone.
    expect(screen.queryByText("Nutrition phase")).not.toBeInTheDocument();
    expect(screen.queryByText("Running")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /reset programme/i })
    ).not.toBeInTheDocument();
  });

  it("D14: no run controls in the lift editor — the run plan has its own page", () => {
    setup({
      runMode: "race_prep",
      raceGoal: { distance: "10k", targetDate: "2027-01-01" },
    });
    expect(
      screen.queryByLabelText(/run days per week/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Long-run volume")).not.toBeInTheDocument();
    expect(screen.queryByText("Intensity")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/target date/i)).not.toBeInTheDocument();
  });

  it("D14: a rebuild threads the SAVED race plan through unchanged", async () => {
    setup(
      {
        runMode: "race_prep",
        raceGoal: { distance: "half", targetDate: "2027-03-01" },
        weeklyRunDaysTarget: 3,
        runVolume: "lighter",
        runDifficulty: "harder",
      },
      "lift"
    );
    fireEvent.click(screen.getByText("Get stronger"));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^save$/i }));
    await vi.waitFor(() => expect(configureSpy).toHaveBeenCalledTimes(1));
    const arg = configureSpy.mock.calls[0][0] as {
      profileUpdates?: Record<string, unknown>;
    };
    expect(arg.profileUpdates?.runMode).toBe("race_prep");
    expect(arg.profileUpdates?.raceGoal).toMatchObject({
      distance: "half",
      targetDate: "2027-03-01",
    });
  });

  it("a lift edit still saves via configurePlan (rebuild path intact)", async () => {
    const { refreshProfile } = setup({}, "lift");
    fireEvent.click(screen.getByText("Get stronger"));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^save$/i }));
    await vi.waitFor(() => expect(configureSpy).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(refreshProfile).toHaveBeenCalledTimes(1));
    const arg = configureSpy.mock.calls[0][0] as {
      profileUpdates?: Record<string, unknown>;
    };
    // Running is preserved (threaded unchanged) — freeform, no race goal.
    expect(arg.profileUpdates?.runMode ?? "freeform").toBe("freeform");
  });
});

describe("ProgrammeSettings — save gating", () => {
  it("save is hidden until a field changes, then enabled", () => {
    setup();
    expect(
      screen.queryByRole("button", { name: /save changes/i })
    ).not.toBeInTheDocument();

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

  it("changing another field preserves the derived nutrition phase unchanged", async () => {
    setup(); // program.goal = "recomp"
    fireEvent.click(screen.getByText("Get stronger"));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await vi.waitFor(() => expect(configureSpy).toHaveBeenCalledTimes(1));
    const payload = configureSpy.mock.calls[0][0] as {
      profileUpdates: { program?: { goal: string } };
    };
    // Phase threads through untouched — the lift edit didn't disturb it.
    expect(payload.profileUpdates.program).toEqual({ goal: "recomp" });
  });
});

describe("ProgrammeSettings — session length (Lift4 (5))", () => {
  it("edits the session length beside the lift days, and saves it with the plan", async () => {
    setup({ liftTimeBudgetMinutes: 60 });
    const lengths = screen.getByRole("radiogroup", {
      name: "Minutes per lift session",
    });
    expect(
      within(lengths).getByRole("radio", { name: "60 min" })
    ).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(lengths).getByRole("radio", { name: "45 min" }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    // The confirm says what a re-fit does before it happens.
    expect(
      screen.getByText(/sets are refitted to sessions of about 45 minutes/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await vi.waitFor(() => expect(configureSpy).toHaveBeenCalledTimes(1));
    const payload = configureSpy.mock.calls[0][0] as {
      profileUpdates: Record<string, unknown>;
    };
    expect(payload.profileUpdates.liftTimeBudgetMinutes).toBe(45);
  });

  it("reads an older 90-minute answer as 75+", () => {
    setup({ liftTimeBudgetMinutes: 90 });
    expect(screen.getByRole("radio", { name: "75+ min" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });
});

describe("ProgrammeSettings — toggles live-save without rebuild", () => {
  it("asks about small plates, off until turned on, in Microloading's place (Lift4 (6))", () => {
    const { updateSettings } = setup();
    expect(screen.queryByText(/microloading/i)).toBeNull();
    const plates = screen.getByRole("switch", { name: /i have small plates/i });
    expect(plates).toHaveAttribute("aria-checked", "false");
    fireEvent.click(plates);
    expect(updateSettings).toHaveBeenCalledWith({ smallPlates: true });
  });

  it("toggling auto-progression calls updateSettings, not configurePlan", () => {
    const { updateSettings } = setup();
    fireEvent.click(screen.getByRole("switch", { name: /auto progression/i }));
    expect(updateSettings).toHaveBeenCalledWith({ autoProgression: false });
    expect(configureSpy).not.toHaveBeenCalled();
  });
});

describe("ProgrammeSettings — overview (the Programme page)", () => {
  it("shows the setup and where each part is set, and edits nothing itself", () => {
    setup({}, "overview");
    expect(screen.getByText("Current setup")).toBeInTheDocument();
    for (const name of [
      /lift plan/i,
      /run plan/i,
      /nutrition phase/i,
      /weekly layout/i,
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    // None of the lift editor's fields, and nothing to save.
    expect(screen.queryByText("Training focus")).not.toBeInTheDocument();
    expect(screen.queryByText("Equipment access")).not.toBeInTheDocument();
    expect(screen.queryByText("Get stronger")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("switch", { name: /auto progression/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save changes/i })
    ).not.toBeInTheDocument();
  });

  it("opens Lift plan and Run plan on their own pages", () => {
    setup(
      {
        runMode: "race_prep",
        raceGoal: { distance: "10k", targetDate: "2027-01-01" },
      },
      "overview"
    );
    const run = screen.getByRole("button", { name: /run plan/i });
    expect(run).toHaveTextContent("Race prep · 10K");
    fireEvent.click(run);
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/settings/run-plan"
    );
    fireEvent.click(screen.getByRole("button", { name: /lift plan/i }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/settings/lift-plan"
    );
  });

  it("nutrition phase is READ-ONLY here — it opens Nutrition, where goal weight sets it", () => {
    setup({}, "overview"); // program.goal = "recomp"
    const row = screen.getByRole("button", { name: /nutrition phase/i });
    expect(row).toHaveTextContent("Recomp");
    // The old direct-pick options are gone — no clickable "Cutting".
    expect(screen.queryByText("Cutting")).not.toBeInTheDocument();
    fireEvent.click(row);
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/settings/nutrition"
    );
  });

  it("opens the weekly layout editor", () => {
    const { onOpenWeeklyLayout } = setup({}, "overview");
    fireEvent.click(screen.getByRole("button", { name: /weekly layout/i }));
    expect(onOpenWeeklyLayout).toHaveBeenCalledTimes(1);
  });

  it("Reset → confirm → regenerateProgram", () => {
    const { regenerateProgram } = setup({}, "overview");
    fireEvent.click(screen.getByRole("button", { name: /reset programme/i }));
    expect(
      within(screen.getByRole("alertdialog")).getByText(
        /logged workouts and runs stay in history/i
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^reset$/i }));
    expect(regenerateProgram).toHaveBeenCalledTimes(1);
  });
});

describe("ProgrammeSettings — waits for the programme it is built on", () => {
  /* As in the Run plan editor: `useProgram` paints before the server has
     answered, with `programState` null (or the cached copy) and
     `readiness` "pending". Save changes was live then, and its confirm
     built a plan from no programme and sent `baseProgramState: null`,
     which the server refuses as a conflict while a programme exists; the
     reset rebuilt from null the same way. */
  const LOADED = {
    goal: "recomp",
    currentPhase: "build",
    weekNumber: 5,
    splitType: "upper_lower",
    workouts: [],
    fatigueScore: 0,
    updatedAt: 1,
    settings: { autoProgression: true, smallPlates: false },
    weekHistory: [],
  } as unknown as ProgramState;
  const LOAD_FAILED =
    "Couldn't load your programme. Reopen this page to try again.";

  it("Save changes waits while the programme loads, then saves on it", async () => {
    const page = setup({}, "lift", undefined, {
      readiness: "pending",
      programState: null,
    });
    fireEvent.click(screen.getByText("Get stronger"));

    // The anchor: the Save under test is on screen, named, and loading.
    const waiting = screen.getByRole("button", { name: "Save changes" });
    expect(waiting).toHaveAttribute("aria-busy", "true");
    expect(waiting).toBeDisabled();
    fireEvent.click(waiting);
    await act(async () => {});
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(configureSpy).not.toHaveBeenCalled();

    page.load({ readiness: "ready", programState: LOADED });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Save",
      })
    );
    await vi.waitFor(() => expect(configureSpy).toHaveBeenCalled());
    expect(configureSpy).toHaveBeenCalledTimes(1);
    // Built on the programme that loaded and committed against it: its
    // week carries over, where a plan from nothing starts at 1.
    const payload = configureSpy.mock.calls[0][0] as {
      baseProgramState: unknown;
      programState: { weekNumber: number };
    };
    expect(payload.baseProgramState).toEqual(LOADED);
    expect(payload.programState.weekNumber).toBe(5);
  });

  it("a failed load says so, and Save changes opens nothing", () => {
    setup({}, "lift", undefined, { readiness: "failed", programState: null });
    fireEvent.click(screen.getByText("Get stronger"));

    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toHaveAccessibleDescription(LOAD_FAILED);
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(configureSpy).not.toHaveBeenCalled();
  });

  it("Reset waits while the programme loads, then resets", async () => {
    const page = setup({}, "overview", undefined, {
      readiness: "pending",
      programState: null,
    });
    fireEvent.click(screen.getByRole("button", { name: /reset programme/i }));

    const dialog = screen.getByRole("alertdialog");
    const waiting = within(dialog).getByRole("button", { name: "Reset" });
    expect(waiting).toHaveAttribute("aria-busy", "true");
    expect(waiting).toBeDisabled();
    // Cancel never waits.
    expect(
      within(dialog).getByRole("button", { name: "Cancel" })
    ).toBeEnabled();
    fireEvent.click(waiting);
    await act(async () => {});
    expect(page.regenerateProgram).not.toHaveBeenCalled();

    page.load({ readiness: "ready", programState: LOADED });
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Reset",
      })
    );
    await vi.waitFor(() =>
      expect(page.regenerateProgram).toHaveBeenCalledTimes(1)
    );
  });

  it("a failed load says so in the reset dialog, and Reset does nothing", async () => {
    const { regenerateProgram } = setup({}, "overview", undefined, {
      readiness: "failed",
      programState: null,
    });
    fireEvent.click(screen.getByRole("button", { name: /reset programme/i }));

    const reset = within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Reset",
    });
    expect(reset).toHaveAccessibleDescription(LOAD_FAILED);
    expect(reset).toBeDisabled();
    fireEvent.click(reset);
    await act(async () => {});
    expect(regenerateProgram).not.toHaveBeenCalled();
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

describe("ProgrammeSettings — split is a derived display (Pgm5 Q1)", () => {
  it("renders the current split as read-only text, not a selectable card", () => {
    // liftDays 4, programState has no splitType → chooseSplit(4) = upper_lower
    setup();
    expect(screen.getByText("Upper / Lower")).toBeInTheDocument();
    // No clickable split option remains — the picker is gone.
    expect(
      screen.queryByRole("button", {
        name: /full body|push \/ pull \/ legs|upper \/ lower/i,
      })
    ).not.toBeInTheDocument();
  });

  it("threads the persisted preferredSplit through save (inert, not chosen)", async () => {
    setup(); // saved preferredSplit = "ppl"
    fireEvent.click(screen.getByText("Get stronger"));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await vi.waitFor(() => expect(configureSpy).toHaveBeenCalledTimes(1));
    const payload = configureSpy.mock.calls[0][0] as {
      profileUpdates: Record<string, unknown>;
    };
    expect(payload.profileUpdates.preferredSplit).toBe("ppl");
  });
});

describe("ProgrammeSettings — save disclosure reflects structure-preservation (Pgm5 Q3)", () => {
  it("a lift-days change names the customization reset", () => {
    setup(); // saved liftDays 4
    fireEvent.click(screen.getByRole("radio", { name: "5" }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(
      screen.getByText(/rebuilds your weekly structure/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/added, removed, or reordered will be reset/i)
    ).toBeInTheDocument();
  });

  it("a content-only change reassures that workouts are kept", () => {
    setup();
    // Equipment is the content-only driver here: post-LIFT-EV-06 a GOAL
    // change with a real prescription shows the keep-or-represcribe choice
    // instead (its own describe below).
    fireEvent.click(screen.getByText("Home gym"));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(screen.getByText(/keep your current workouts/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/rebuilds your weekly structure/i)
    ).not.toBeInTheDocument();
  });
});

describe("ProgrammeSettings — keep-or-represcribe on a same-frequency goal change (LIFT-EV-06)", () => {
  // A real 4-day prescription, so buildPlan's preserve branch runs and the
  // choice exists. Minimal exercises carrying the fields represcribe touches.
  const liftEx = (id: string, category: string) => ({
    name: id,
    exerciseId: id,
    movementCategory: category,
    sets: 3,
    baseSets: 3,
    reps: 10,
    baseReps: 10,
    repRangeMax: 12,
    weight: 60,
    progressionType: "double",
    lastSuccessfulWeight: 60,
    lastAttemptedWeight: 60,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
  });
  const liftState = {
    settings: { autoProgression: true, smallPlates: false },
    splitType: "upper_lower",
    weekNumber: 5,
    currentPhase: "progression",
    goal: "recomp",
    workouts: [
      {
        dayName: "Upper A",
        dayType: "upper",
        exercises: [liftEx("bench-press", "horizontal_push")],
      },
      {
        dayName: "Lower A",
        dayType: "lower",
        exercises: [liftEx("back-squat", "squat")],
      },
      {
        dayName: "Upper B",
        dayType: "upper",
        exercises: [liftEx("overhead-press", "vertical_push")],
      },
      {
        dayName: "Lower B",
        dayType: "lower",
        exercises: [liftEx("deadlift", "hinge")],
      },
    ],
  } as unknown as ProgramState;

  it("offers the choice with honest consequence copy, no silent default", () => {
    setup({}, "lift", liftState);
    fireEvent.click(screen.getByText("Get stronger"));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    // Both explicit saves, plus cancel — the single "Save" is gone.
    expect(
      screen.getByRole("button", { name: /save and update sessions/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save, keep current sessions/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^save$/i })).toBeNull();
    // Consequence copy names the new focus and its rep target.
    expect(screen.getByText(/New focus: Get stronger/i)).toBeInTheDocument();
  });

  it("'update sessions' sends the represcribed workouts through configurePlan", async () => {
    const { represcribeWorkouts } =
      await import("@/features/program/represcribe");
    setup({}, "lift", liftState);
    fireEvent.click(screen.getByText("Get stronger"));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /save and update sessions/i })
    );
    await vi.waitFor(() => expect(configureSpy).toHaveBeenCalledTimes(1));
    const payload = configureSpy.mock.calls[0][0] as {
      programState: { workouts: unknown };
      profileUpdates: Record<string, unknown>;
    };
    expect(payload.profileUpdates.primaryGoal).toBe("strength");
    // Exactly the training-block transform, applied to the preserved week.
    expect(payload.programState.workouts).toEqual(
      represcribeWorkouts(liftState.workouts, "strength", "intermediate")
    );
  });

  it("'keep current sessions' sends the workouts verbatim", async () => {
    setup({}, "lift", liftState);
    fireEvent.click(screen.getByText("Get stronger"));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /save, keep current sessions/i })
    );
    await vi.waitFor(() => expect(configureSpy).toHaveBeenCalledTimes(1));
    const payload = configureSpy.mock.calls[0][0] as {
      programState: { workouts: unknown };
      profileUpdates: Record<string, unknown>;
    };
    expect(payload.profileUpdates.primaryGoal).toBe("strength");
    expect(payload.programState.workouts).toEqual(liftState.workouts);
  });

  it("offers the choice when the level changes too, and re-aims at the new level", async () => {
    // A level change keeps the plan (Lift4 (12)), so the focus would go
    // nowhere without the choice.
    const { represcribeWorkouts } =
      await import("@/features/program/represcribe");
    setup({}, "lift", liftState);
    fireEvent.click(screen.getByText("Get stronger"));
    fireEvent.click(screen.getByRole("button", { name: /^advanced/i }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /save and update sessions/i })
    );
    await vi.waitFor(() => expect(configureSpy).toHaveBeenCalledTimes(1));
    const payload = configureSpy.mock.calls[0][0] as {
      programState: { workouts: unknown };
    };
    expect(payload.programState.workouts).toEqual(
      represcribeWorkouts(liftState.workouts, "strength", "advanced")
    );
  });

  it("no choice when lift days change too — the rebuild arm owns that", () => {
    setup({}, "lift", liftState);
    fireEvent.click(screen.getByText("Get stronger"));
    fireEvent.click(screen.getByRole("radio", { name: "5" }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(
      screen.queryByRole("button", { name: /save and update sessions/i })
    ).toBeNull();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
  });
});
