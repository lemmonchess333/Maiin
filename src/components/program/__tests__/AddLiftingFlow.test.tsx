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
import { SETUP, SPORT_CHANGE } from "@/test/journeyScreens";

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

function setup(readiness: ProgramReadiness = "ready") {
  const who = runner();
  const refreshProfile = vi.fn().mockResolvedValue(undefined);
  render(
    <MemoryRouter>
      <AddLiftingFlow
        profile={who.profile}
        programState={who.programState}
        readiness={readiness}
        recentRuns={null}
        refreshProfile={refreshProfile}
      />
    </MemoryRouter>
  );
  return { ...who, refreshProfile };
}

const button = (name: string | RegExp) => screen.getByRole("button", { name });

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
});
