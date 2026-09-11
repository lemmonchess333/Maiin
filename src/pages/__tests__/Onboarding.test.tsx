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
    // Equipment and experience are answers, not settings that arrive set:
    // neither alone releases the step.
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Full gym/ }));
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Some experience/ }));
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
    // Height, weight and the age range all feed the calorie estimate, so
    // none of them may be taken from the control's starting position.
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Weight (kg)"), {
      target: { value: "81.5" },
    });
    fireEvent.change(screen.getByLabelText("Height (cm)"), {
      target: { value: "175" },
    });
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "25–34" }));
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
    // The week rail is optional on this step now, so the journey starts by
    // opening it. Without this click the assertions below still pass —
    // jsdom keeps a closed <details>'s content in the DOM — which would
    // leave this test green over a preview no user can see.
    fireEvent.click(screen.getByText("See the exercises this builds"));
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

/* Everything the profile learns about a person has to come FROM them.
   Equipment, lifting experience, height, weight and the age range all
   arrived on a value with nothing gating the step, so tapping Continue
   through setup wrote a stranger's body and training history: a full-gym
   intermediate of 175 cm and 75 kg, aged 25-34. That is not a cosmetic
   default — equipment picks the exercises, experience sets the starting
   loads, and the other three are the whole calorie estimate. */
describe("answers the user has not given", () => {
  const reachSetup = () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Build muscle/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("radio", { name: "Lifting" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  };

  it("shows no equipment or experience as chosen on arrival", () => {
    reachSetup();
    expect(
      screen.getByRole("heading", { name: "Equipment access" })
    ).toBeInTheDocument();
    for (const name of [
      /Full gym/,
      /Home gym/,
      /Minimal/,
      /New to lifting/,
      /Some experience/,
      /Experienced/,
    ]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute(
        "aria-pressed",
        "false"
      );
    }
  });

  it("does not offer a starting suggestion to tap past", () => {
    // The copy apologised for the default rather than removing it, and it
    // is the sentence that would come back first if the gate were lost.
    reachSetup();
    expect(screen.queryByText(/Starting suggestion/i)).not.toBeInTheDocument();
  });

  it("leaves height and weight empty rather than pre-filled", () => {
    // A draft parked ON this step carries figures nobody confirmed, so the
    // boxes stay empty even though the numbers are in the draft.
    saveOnboardingDraft("setup-test", { ...draft, step: 5 });
    open();
    expect(
      screen.getByRole("heading", { name: "Start with your numbers" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Weight (kg)")).toHaveValue("");
    expect(screen.getByLabelText("Height (cm)")).toHaveValue("");
  });

  it("carries a resumed draft through without re-asking", () => {
    // A draft written before these gates existed has no flags on it. Read
    // as unanswered, it would send someone who has already finished setup
    // back through it — so "got past that step" counts as answered.
    saveOnboardingDraft("setup-test", { ...draft, step: 7 });
    open();
    expect(
      screen.getByRole("button", { name: "Create my plan" })
    ).toBeEnabled();
  });
});

/* Run9a lands a persisted race_prep with no usable date on the freeform
   substrate rather than leaving a dangling raceGoal, and that stays. What
   changed is that onboarding no longer CREATES that state: the control
   read "Race prep" while the plan being built was free running. */
describe("a race needs a date", () => {
  const reachRunningPlan = () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Improve running/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: /Occasional runner/ }));
  };

  it("holds the step while race prep is chosen with no date", () => {
    reachRunningPlan();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    fireEvent.click(screen.getByRole("radio", { name: "Race prep" }));
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("releases it once a date is given", () => {
    reachRunningPlan();
    fireEvent.click(screen.getByRole("radio", { name: "Race prep" }));
    fireEvent.change(screen.getByLabelText("Race target date"), {
      target: { value: "2027-06-01" },
    });
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("releases it by going back to free running", () => {
    // The other half of the choice, and the one the copy points at.
    reachRunningPlan();
    fireEvent.click(screen.getByRole("radio", { name: "Race prep" }));
    expect(
      screen.getByText(/Pick your race date, or choose Free running/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Free running" }));
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("no longer calls the date optional", () => {
    reachRunningPlan();
    fireEvent.click(screen.getByRole("radio", { name: "Race prep" }));
    expect(screen.queryByLabelText(/optional/i)).not.toBeInTheDocument();
  });
});

/* One flow, one vocabulary. The goal cards offered "Build muscle" and the
   review screen read the same choice back as "Hypertrophy focus" — two
   spellings of one value inside a single file, which is the case
   CONTEXT.md's naming rule says is the one that actually hurts. The
   settings confirm modal and ProgrammeSettings keep their own registers
   on purpose; those are other surfaces. */
describe("the goal is named the same way throughout", () => {
  it("reads the choice back in the words it was offered in", () => {
    saveOnboardingDraft("setup-test", {
      ...draft,
      primaryGoal: "hypertrophy",
      step: 7,
    });
    open();
    // The review names the goal in more than one place (the focus row and
    // the plan summary line); all of them are the same words now.
    expect(screen.getAllByText(/Build muscle/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Hypertrophy/)).not.toBeInTheDocument();
  });

  it("offers the goal under that same name", () => {
    saveOnboardingDraft("setup-test", { ...draft, step: 0 });
    open();
    expect(
      screen.getByRole("button", { name: /Build muscle/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Hypertrophy/ })
    ).not.toBeInTheDocument();
  });

  it("titles the last step Your plan", () => {
    saveOnboardingDraft("setup-test", { ...draft, step: 7 });
    open();
    expect(
      screen.getByRole("heading", { name: "Your plan" })
    ).toBeInTheDocument();
  });
});

/* The draft week renders on four screens. On three it is the thing being
   decided — steps 1 and 3 are the "Your week" chapter, the last step is
   the review — and on the setup step it repeated a picture that had not
   moved, because equipment and experience change the exercises inside the
   days rather than the shape of the week. */
describe("where the draft week is worth showing", () => {
  it("is open while you are choosing the week itself", () => {
    saveOnboardingDraft("setup-test", { ...draft, step: 1 });
    open();
    expect(screen.getByRole("region", { name: "Draft week" })).toBeVisible();
  });

  it("is open on the final review", () => {
    saveOnboardingDraft("setup-test", { ...draft, step: 7 });
    open();
    expect(
      screen.getByRole("region", { name: "Your week shape" })
    ).toBeVisible();
  });

  it("is optional on the setup step", () => {
    saveOnboardingDraft("setup-test", { ...draft, step: 2 });
    open();
    expect(
      screen.getByRole("region", { name: "Draft week" })
    ).not.toBeVisible();
    fireEvent.click(screen.getByText("See the exercises this builds"));
    expect(screen.getByRole("region", { name: "Draft week" })).toBeVisible();
  });

  it("says what opening it shows, not just that it is a preview", () => {
    // Tapping a day in there is the only place the app shows that a kit
    // change rebuilt the sessions; a bare "Preview" hides that.
    saveOnboardingDraft("setup-test", { ...draft, step: 2 });
    open();
    expect(
      screen.getByText("See the exercises this builds")
    ).toBeInTheDocument();
  });
});

/* Running offered two tiers, both of which assume you already run. Someone
   starting out had to call themselves an occasional runner and take its
   two-a-week target — a week that opens on a miss. */
describe("new runners", () => {
  const reachRunStep = () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Improve running/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  };

  it("offers a beginner tier, first in the list", () => {
    reachRunStep();
    const options = screen
      .getAllByRole("button")
      .map((b) => b.textContent ?? "")
      .filter((t) => /runner|New to running/.test(t));
    expect(options[0]).toMatch(/New to running/);
  });

  it("arrives unchosen like the tiers beside it", () => {
    reachRunStep();
    expect(
      screen.getByRole("button", { name: /New to running/ })
    ).toHaveAttribute("aria-pressed", "false");
  });

  /* Asserted through the plan builder, not a control: freeform mode shows
     no runs-per-week slider (that lives in the race-prep card) and its
     review line reads "no scheduled runs", so the target is real but not
     on screen here. It is what the weekly checks and the adherence score
     measure the week against. */
  const targetAfterPicking = (name: RegExp) => {
    // Each tier is its own walk: the draft persists to localStorage, so a
    // second render without clearing resumes mid-flow instead of at step 0.
    cleanup();
    localStorage.clear();
    const builder = vi.spyOn(planning, "buildOnboardingPlan");
    reachRunStep();
    fireEvent.click(screen.getByRole("button", { name }));
    // Race prep WITH a date, because freeform's target is 0 whatever tier
    // you pick (the freeform test below pins exactly that), and race prep
    // without a date resolves to the freeform substrate under Run9a.
    fireEvent.click(screen.getByRole("radio", { name: /race prep/i }));
    fireEvent.change(screen.getByLabelText("Race target date"), {
      target: { value: "2027-06-01" },
    });
    const target =
      builder.mock.results.at(-1)!.value.profileUpdates.weeklyRunDaysTarget;
    builder.mockRestore();
    return target;
  };

  it("plans no runs for a freeform week, whichever tier is picked", () => {
    // Run9a: freeform is a substrate with NO scheduled runs, so
    // weeklyRunDays is inert there. The tier is still worth having — it
    // stops a beginner having to call themselves an occasional runner, and
    // it is persisted — but on the default path it describes the user
    // rather than changing the plan. Anything that reads the tier as a
    // freeform scheduling lever is reading it wrong.
    const builder = vi.spyOn(planning, "buildOnboardingPlan");
    reachRunStep();
    fireEvent.click(screen.getByRole("button", { name: /New to running/ }));
    expect(
      builder.mock.results.at(-1)!.value.profileUpdates.weeklyRunDaysTarget
    ).toBe(0);
    builder.mockRestore();
  });

  it("starts them at a reachable weekly target", () => {
    // One is reachable; two is what "occasional" already means, so a
    // beginner tier that also meant two would be a label and nothing else.
    expect(targetAfterPicking(/New to running/)).toBe(1);
  });

  it("leaves the existing tiers where they were", () => {
    expect(targetAfterPicking(/Regular runner/)).toBe(3);
    expect(targetAfterPicking(/Occasional runner/)).toBe(2);
  });
});
