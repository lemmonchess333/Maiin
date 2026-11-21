/**
 * Add lifting (TrainWk1 step 6; the Train grill's Q28): a runner's Lift
 * plan asks setup's three lifting questions, one a screen, and builds the
 * lifting around their runs, which keep their days. Before, the page
 * showed the whole editor with no lift days selected and no way in.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AddLiftingFlow from "../AddLiftingFlow";
import { buildPlan } from "@/features/program/planBuilder";
import { localDateString } from "@/lib/dateHelpers";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";
import type { ProgramReadiness } from "@/features/program/useProgram";
import type { LastSet } from "@/features/program/lastSets";
import { toast } from "@/lib/toast";
import { SETUP, SPORT_CHANGE } from "@/test/journeyScreens";
import { EXERCISE_WARNING } from "@/lib/exerciseWarning";

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

/** A runner on the starter goal, as setup leaves one: no lift days. */
function runner(): { profile: UserProfile; programState: ProgramState } {
  const plan = buildPlan({
    primaryGoal: "running",
    nutritionPhase: "recomp",
    experience: "beginner",
    liftDays: 0,
    preferredSplit: "full_body",
    runMode: "starter",
    weeklyRunDays: 3,
    equipment: "full_gym",
    injuries: [],
    currentDate: localDateString(new Date()),
    preserveHistory: false,
  });
  return {
    profile: {
      uid: "runner",
      athleteType: "Runner",
      runFrequency: "new",
      starterGoal: { startedOn: localDateString(new Date()) },
      weightKg: 70,
      sex: "female",
      ...plan.profileUpdates,
    } as unknown as UserProfile,
    programState: plan.programState,
  };
}

function setup(
  readiness: ProgramReadiness = "ready",
  {
    lastSets = null,
    historyPending = false,
    refreshProfile = vi.fn().mockResolvedValue(undefined),
  }: {
    lastSets?: ReadonlyMap<string, readonly LastSet[]> | null;
    historyPending?: boolean;
    refreshProfile?: () => Promise<void>;
  } = {}
) {
  const who = runner();
  render(
    <MemoryRouter>
      <AddLiftingFlow
        profile={who.profile}
        programState={who.programState}
        readiness={readiness}
        recentRuns={null}
        lastSets={lastSets}
        historyPending={historyPending}
        refreshProfile={refreshProfile}
      />
    </MemoryRouter>
  );
  return { ...who, refreshProfile };
}

const button = (name: string | RegExp) => screen.getByRole("button", { name });

/** Through the three questions to Add lifting: four full-gym days for
 *  someone with some experience and nothing to work around. */
function answerAll() {
  fireEvent.click(screen.getByRole("radio", { name: "4" }));
  fireEvent.click(button("Continue"));
  fireEvent.click(button(/^Full gym/));
  fireEvent.click(button(/^Some experience/));
  fireEvent.click(button("Continue"));
  fireEvent.click(button(SETUP.noInjuries));
}

type Payload = {
  profileUpdates: Record<string, unknown>;
  programState: ProgramState;
};

beforeEach(() => configureSpy.mockClear());

describe("AddLiftingFlow", () => {
  it("asks setup's three questions in order, and adds lifting around the runs", async () => {
    const { profile, refreshProfile } = setup();
    expect(
      screen.getByRole("heading", { name: SPORT_CHANGE.addLiftingQuestion })
    ).toBeInTheDocument();
    expect(screen.getByText(/1 of 3/)).toBeInTheDocument();
    fireEvent.click(
      within(
        screen.getByRole("radiogroup", { name: SETUP.liftDays })
      ).getByRole("radio", { name: "2" })
    );
    fireEvent.click(button("Continue"));

    // The kit and the experience: nothing chosen until the person chooses.
    expect(
      screen.getByRole("heading", { name: "Make the plan fit your setup" })
    ).toBeInTheDocument();
    expect(button("Continue")).toBeDisabled();
    fireEvent.click(button(/^Home gym/));
    expect(button("Continue")).toBeDisabled();
    fireEvent.click(button(/^New to lifting/));
    fireEvent.click(button("Continue"));

    // Anything to work around, then Add lifting.
    expect(
      screen.getByRole("heading", { name: "Anything to work around?" })
    ).toBeInTheDocument();
    expect(button(SPORT_CHANGE.addLifting)).toBeDisabled();
    fireEvent.click(button("Knee"));
    fireEvent.click(button(SPORT_CHANGE.addLifting));

    await waitFor(() => expect(configureSpy).toHaveBeenCalledTimes(1));
    const payload = configureSpy.mock.calls[0][0] as {
      profileUpdates: Record<string, unknown>;
      programState: ProgramState;
      weekSchedule: { day: number; type: string }[];
    };
    expect(payload.profileUpdates).toMatchObject({
      weeklyWorkoutsTarget: 2,
      equipment: "home_gym",
      experience: "beginner",
      injuries: ["knee"],
    });
    expect(payload.profileUpdates).not.toHaveProperty("athleteType");
    expect(payload.programState.workouts).toHaveLength(2);
    // The runs keep their days.
    profile.weekSchedule!.forEach((day, i) => {
      if (day.type === "run")
        expect(["run", "both"]).toContain(payload.weekSchedule[i].type);
    });
    // The starter goal carries on.
    expect(payload.programState.runPlan).toMatchObject({ mode: "starter" });
    await waitFor(() => expect(refreshProfile).toHaveBeenCalled());
  });

  it("Back goes a step back and keeps the answers", () => {
    setup();
    fireEvent.click(screen.getByRole("radio", { name: "4" }));
    fireEvent.click(button("Continue"));
    fireEvent.click(button(/^Full gym/));
    fireEvent.click(button(/^Some experience/));
    fireEvent.click(button("Back"));
    expect(screen.getByRole("radio", { name: "4" })).toBeChecked();
    fireEvent.click(button("Continue"));
    expect(button(/^Full gym/)).toHaveAttribute("aria-pressed", "true");
    expect(button(/^Some experience/)).toHaveAttribute("aria-pressed", "true");
  });

  it("waits for the programme before it saves", () => {
    setup("pending");
    fireEvent.click(button("Continue"));
    fireEvent.click(button(/^Full gym/));
    fireEvent.click(button(/^Some experience/));
    fireEvent.click(button("Continue"));
    fireEvent.click(button(SETUP.noInjuries));
    // Loading: the button keeps its name under the spinner, and sends
    // nothing.
    const add = button("Add lifting");
    expect(add).toBeDisabled();
    fireEvent.click(add);
    expect(configureSpy).not.toHaveBeenCalled();
  });

  it("starts each lift done before from its last session (Stop lifting, then Add lifting)", async () => {
    // Every lift the plan could pick, last done at 100 kg for 5.
    const ids = buildPlan({
      primaryGoal: "hypertrophy",
      nutritionPhase: "recomp",
      experience: "intermediate",
      liftDays: 4,
      preferredSplit: "auto",
      runMode: "starter",
      weeklyRunDays: 3,
      equipment: "full_gym",
      injuries: [],
      currentDate: localDateString(new Date()),
      preserveHistory: false,
    }).programState.workouts.flatMap((d) =>
      d.exercises.map((e) => e.exerciseId)
    );
    const lastSets = new Map(
      ids.map((id) => [id, [{ weightKg: 100, reps: 5 }]] as const)
    );
    setup("ready", { lastSets });
    answerAll();
    fireEvent.click(button(SPORT_CHANGE.addLifting));
    await waitFor(() => expect(configureSpy).toHaveBeenCalledTimes(1));
    const payload = configureSpy.mock.calls[0][0] as Payload;
    const loaded = payload.programState.workouts
      .flatMap((d) => d.exercises)
      .filter((e) => e.weight > 0);
    expect(loaded.length).toBeGreaterThan(0);
    // None above last time's 100 kg, and the main lifts at it or just
    // under it for their reps: not the plan's first guesses.
    for (const e of loaded) expect(e.weight).toBeLessThanOrEqual(100);
    expect(loaded.some((e) => e.weight >= 85)).toBe(true);
  });

  it("waits for the saved workouts before it saves", () => {
    setup("ready", { historyPending: true });
    answerAll();
    const add = button("Add lifting");
    expect(add).toBeDisabled();
    fireEvent.click(add);
    expect(configureSpy).not.toHaveBeenCalled();
  });

  it("says lifting was added when only the refresh after the save failed", async () => {
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
    const reload = vi.fn();
    const location = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...location, reload },
    });
    try {
      setup("ready", {
        refreshProfile: vi.fn().mockRejectedValue(new Error("offline")),
      });
      answerAll();
      fireEvent.click(button(SPORT_CHANGE.addLifting));
      await waitFor(() => expect(reload).toHaveBeenCalled());
      expect(configureSpy).toHaveBeenCalledTimes(1);
      expect(toast.success).toHaveBeenCalledWith("Lifting added");
      expect(toast.error).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: location,
      });
    }
  });

  it("shows the exercise warning under the limitation choices, as setup does", () => {
    setup();
    expect(screen.queryByText(EXERCISE_WARNING)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "4" }));
    fireEvent.click(button("Continue"));
    fireEvent.click(button(/^Full gym/));
    fireEvent.click(button(/^Some experience/));
    fireEvent.click(button("Continue"));
    const warning = screen.getByText(EXERCISE_WARNING);
    expect(
      button(SETUP.noInjuries).compareDocumentPosition(warning) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});
