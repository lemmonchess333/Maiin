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
import { MemoryRouter } from "react-router-dom";
import ProgrammeSettings from "../ProgrammeSettings";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";

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
  settings: { autoProgression: true, microloading: true },
} as ProgramState;

function setup(
  profileOverrides: Partial<UserProfile> = {},
  variant: "full" | "lift" = "full"
) {
  const updateSettings = vi.fn();
  const regenerateProgram = vi.fn();
  const onOpenWeeklyLayout = vi.fn();
  render(
    <MemoryRouter>
      <ProgrammeSettings
        variant={variant}
        profile={makeProfile(profileOverrides)}
        programState={programState}
        updateSettings={updateSettings}
        regenerateProgram={regenerateProgram}
        onOpenWeeklyLayout={onOpenWeeklyLayout}
      />
    </MemoryRouter>
  );
  return { updateSettings, regenerateProgram, onOpenWeeklyLayout };
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

  it("full variant still shows nutrition + running (unchanged)", () => {
    setup({}, "full");
    expect(screen.getByText("Nutrition phase")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("a lift edit still saves via configurePlan (rebuild path intact)", async () => {
    setup({}, "lift");
    fireEvent.click(screen.getByText("Get stronger"));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^save$/i }));
    await vi.waitFor(() => expect(configureSpy).toHaveBeenCalledTimes(1));
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

  it("nutrition phase is READ-ONLY here — a derived link to /settings/nutrition, not a picker", () => {
    setup(); // baseline program.goal = "recomp"
    // The current phase shows as a summary…
    expect(screen.getByText("Recomp")).toBeInTheDocument();
    // …that links to the one place direction is set (goal weight owns it).
    const link = screen.getByRole("link", { name: /recomp/i });
    expect(link).toHaveAttribute("href", "/settings/nutrition");
    // The old direct-pick options are gone — no clickable "Cutting".
    expect(screen.queryByText("Cutting")).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByText("Get stronger")); // goal change, same lift days
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(screen.getByText(/keep your current workouts/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/rebuilds your weekly structure/i)
    ).not.toBeInTheDocument();
  });
});
