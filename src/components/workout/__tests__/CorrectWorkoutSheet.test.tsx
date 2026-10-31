import { beforeEach, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Workout } from "@/hooks/useWorkouts";
import CorrectWorkoutSheet from "../CorrectWorkoutSheet";
const h = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/lib/workoutCorrection", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workoutCorrection")>()),
  correctSavedWorkout: h.save,
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/hooks/useWorkoutDraft", () => ({
  createWorkoutCompletionId: () => "stable-correction",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
beforeEach(() => {
  h.save.mockReset();
});

it.each([1 / 3, 61.25])(
  "keeps a %s-minute clock valid while correcting a set",
  async (durationMinutes) => {
    h.save.mockResolvedValue(undefined);
    const onSaved = vi.fn();
    render(
      <CorrectWorkoutSheet
        uid="u1"
        workout={
          {
            id: "short-lift",
            durationMinutes,
            exercises: [
              {
                exerciseId: "push-ups",
                exerciseName: "Push-Ups",
                sets: [{ reps: 8, weightKg: 0 }],
              },
            ],
          } as Workout
        }
        unit="kg"
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    );
    expect(screen.getByLabelText("Duration (minutes)")).toBeValid();
    fireEvent.change(screen.getByLabelText("Set 1 reps"), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save corrections" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(h.save.mock.calls[0][5].durationMinutes).toBe(durationMinutes);
  }
);

it("retains corrections after failure, retries the same revision and accepts only one pending save", async () => {
  const onClose = vi.fn(),
    onSaved = vi.fn();
  h.save.mockRejectedValueOnce(new Error("Connection lost"));
  render(
    <CorrectWorkoutSheet
      uid="u1"
      workout={
        {
          id: "lift",
          revision: 2,
          durationMinutes: 40,
          exercises: [
            {
              exerciseId: "bench",
              exerciseName: "Bench",
              sets: [{ reps: 8, weightKg: 70 }],
            },
          ],
        } as Workout
      }
      unit="kg"
      onClose={onClose}
      onSaved={onSaved}
    />
  );
  fireEvent.change(screen.getByLabelText("Set 1 weight (kg)"), {
    target: { value: "50" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save corrections" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Connection lost");
  expect(screen.getByLabelText("Set 1 weight (kg)")).toHaveValue(50);
  expect(onSaved).not.toHaveBeenCalled();
  let finish!: () => void;
  h.save.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const save = screen.getByRole("button", { name: "Save corrections" });
  fireEvent.click(save);
  fireEvent.click(save);
  expect(h.save).toHaveBeenCalledTimes(2);
  expect(h.save.mock.calls[0]).toEqual(h.save.mock.calls[1]);
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(screen.getByLabelText("Set 1 weight (kg)")).toBeDisabled();
  await act(async () => finish());
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(onClose).not.toHaveBeenCalled();
});

it("asks before saving a weight more than twice the set's plan (Lift16)", async () => {
  h.save.mockResolvedValue(undefined);
  const onSaved = vi.fn();
  render(
    <CorrectWorkoutSheet
      uid="u1"
      workout={
        {
          id: "lift",
          revision: 1,
          durationMinutes: 40,
          exercises: [
            {
              exerciseId: "lateral-raise",
              exerciseName: "Lateral Raise",
              sets: [{ reps: 12, weightKg: 12.5, plannedWeightKg: 12.5 }],
            },
          ],
        } as Workout
      }
      unit="kg"
      onClose={vi.fn()}
      onSaved={onSaved}
    />
  );
  fireEvent.change(screen.getByLabelText("Set 1 weight (kg)"), {
    target: { value: "125" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save corrections" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "125 kg?This set was planned at 12.5 kg."
  );
  expect(h.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Change it" }));
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save corrections" }));
  fireEvent.click(await screen.findByRole("button", { name: "Save 125 kg" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(h.save.mock.calls[0][5].exercises[0].sets[0].weightKg).toBe(125);
});

it("in lb, shows and asks in lb and saves kg; an untouched weight keeps its kg (Lift18)", async () => {
  h.save.mockResolvedValue(undefined);
  const onSaved = vi.fn();
  render(
    <CorrectWorkoutSheet
      uid="u1"
      workout={
        {
          id: "lift",
          revision: 1,
          durationMinutes: 40,
          exercises: [
            {
              exerciseId: "bench",
              exerciseName: "Bench",
              sets: [
                { reps: 5, weightKg: 60, plannedWeightKg: 60 },
                { reps: 5, weightKg: 60, plannedWeightKg: 60 },
              ],
            },
          ],
        } as Workout
      }
      unit="lbs"
      onClose={vi.fn()}
      onSaved={onSaved}
    />
  );
  // A kg set read in lb.
  expect(screen.getByLabelText("Set 1 weight (lb)")).toHaveValue(132.3);
  fireEvent.change(screen.getByLabelText("Set 2 weight (lb)"), {
    target: { value: "300" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save corrections" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "300 lb?This set was planned at 132.3 lb."
  );
  fireEvent.click(await screen.findByRole("button", { name: "Save 300 lb" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  const [first, second] = h.save.mock.calls[0][5].exercises[0].sets;
  expect(first.weightKg).toBe(60);
  expect(second.weightKg).toBeCloseTo(136.08, 2);
  expect(h.save.mock.calls[0][6]).toBe("lbs");
});
