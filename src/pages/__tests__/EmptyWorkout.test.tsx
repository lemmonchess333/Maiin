/**
 * An empty workout (Mob1 call 1): the session opens with no exercises,
 * and saves through `completeLift` as a free workout, with no plan to
 * move. What the session does with Add exercise is
 * `WorkoutSessionAddExercise.test.tsx`'s.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
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

/** The address the page is at, as the test can read it. */
function Address() {
  const location = useLocation();
  return <p data-testid="address">{location.search}</p>;
}

function open(path = EMPTY_WORKOUT_PATH) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path={EMPTY_WORKOUT_PATH}
          element={
            <>
              <EmptyWorkout />
              <Address />
            </>
          }
        />
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

  it("carries on the workout Resume names, on its own session", () => {
    open(`${EMPTY_WORKOUT_PATH}?session=abc-1&resume=1`);
    expect(h.session?.resumeDraft).toBe(true);
    expect(h.session?.draftScope).toBe("empty:abc-1");
    // The resume flag comes off the address; the session stays on it.
    expect(screen.getByTestId("address")).toHaveTextContent("?session=abc-1");
  });

  it("gives each new empty workout a session of its own, kept in the address", () => {
    // One finished and still waiting for the server keeps its own draft:
    // the next empty workout is a new session, not that finish screen.
    const first = open();
    const scope = h.session?.draftScope;
    expect(scope).toMatch(/^empty:[A-Za-z0-9-]+$/);
    expect(screen.getByTestId("address")).toHaveTextContent(
      `?session=${scope!.slice("empty:".length)}`
    );
    first.unmount();
    open();
    expect(h.session?.draftScope).toMatch(/^empty:/);
    expect(h.session?.draftScope).not.toBe(scope);
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
