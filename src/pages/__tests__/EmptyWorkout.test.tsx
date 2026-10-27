/**
 * An empty workout (Mob1 call 1): the session opens with no exercises,
 * and saves through `completeLift` as a free workout, with no plan to
 * move. What the session does with Add exercise is
 * `WorkoutSessionAddExercise.test.tsx`'s.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ComponentProps } from "react";
import type WorkoutSessionType from "@/components/WorkoutSession";

type SessionProps = ComponentProps<typeof WorkoutSessionType>;
const h = vi.hoisted(() => ({
  session: null as SessionProps | null,
  completeLift: vi.fn(),
}));
vi.mock("@/components/WorkoutSession", () => ({
  default: (props: SessionProps) => {
    h.session = props;
    return <div>Session for {props.day.dayName}</div>;
  },
}));
vi.mock("@/lib/liftCompletion", () => ({ completeLift: h.completeLift }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "u1" },
    profile: { displayName: "Alex", weightKg: 80 },
  }),
}));
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "u1" } },
}));

import EmptyWorkout from "../EmptyWorkout";
import {
  EMPTY_WORKOUT_DAY_INDEX,
  EMPTY_WORKOUT_PATH,
} from "@/features/program/emptyWorkout";

function open(path = EMPTY_WORKOUT_PATH) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={EMPTY_WORKOUT_PATH} element={<EmptyWorkout />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  h.session = null;
  h.completeLift.mockReset();
  h.completeLift.mockResolvedValue({
    workoutId: "free-c1",
    share: {},
    syncStatus: "synced",
    sync: Promise.resolve("synced"),
    committed: null,
  });
});

describe("EmptyWorkout", () => {
  it("opens a session with no exercises, under a day no plan day has", () => {
    open();
    expect(screen.getByText("Session for Workout")).toBeInTheDocument();
    expect(h.session?.day.exercises).toEqual([]);
    expect(h.session?.dayIndex).toBe(EMPTY_WORKOUT_DAY_INDEX);
    expect(h.session?.resumeDraft).toBe(false);
  });

  it("carries on a workout under way when opened from Resume", () => {
    open(`${EMPTY_WORKOUT_PATH}?resume=1`);
    expect(h.session?.resumeDraft).toBe(true);
  });

  it("saves what was added as a free workout that moves no plan", async () => {
    open();
    const ran = [
      {
        exerciseId: "lateral-raise",
        name: "Lateral Raise",
        instanceId: "today-1",
        sets: 2,
        reps: 12,
        weight: 8,
      },
    ];
    const receipt = await h.session!.onCompleteDay(EMPTY_WORKOUT_DAY_INDEX, {
      completionId: "c1",
      completionCommandId: "c1",
      durationMinutes: 20,
      startedAt: 1_000,
      setLogs: [[{ weight: 8, reps: 12, completed: true }]],
      prescription: {
        dayName: "Workout",
        exercises: ran as never,
        progressionBaseline: [],
      },
    });
    expect(receipt.workoutId).toBe("free-c1");
    expect(h.completeLift).toHaveBeenCalledOnce();
    const finished = h.completeLift.mock.calls[0][0];
    expect(finished).toMatchObject({
      uid: "u1",
      source: "free",
      completionId: "c1",
      startedAt: 1_000,
      ran,
      title: "Workout",
      bodyweightKg: 80,
    });
    // No plan day behind it: nothing to mark done, no lift to step.
    expect(finished.completion).toBeUndefined();
  });
});
