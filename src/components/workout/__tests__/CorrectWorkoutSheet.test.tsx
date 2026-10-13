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
