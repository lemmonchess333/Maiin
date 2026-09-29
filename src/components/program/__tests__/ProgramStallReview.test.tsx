import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { remove, writeString } from "@/lib/localStore";
import { stallCooldownKey } from "@/features/program/stallDetection";
import type { ProgramExercise } from "@/features/program/programTypes";
import ProgramStallReview from "../ProgramStallReview";

vi.mock("@/lib/auth", () => ({ useUidForStorageKey: () => "stall-user" }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/hooks/useWorkouts", () => ({
  useWorkouts: () => ({
    workouts: Array.from({ length: 3 }, () => ({
      exercises: [
        { exerciseName: "Barbell Row", sets: [{ weightKg: 60, reps: 8 }] },
      ],
    })),
  }),
}));
vi.mock("@/components/workout/StallModal", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog">
      <button onClick={onClose}>Close review</button>
    </div>
  ),
}));
const exercises = [
  { name: "Barbell Row", exerciseId: "barbell-row" },
] as ProgramExercise[];
beforeEach(() => remove(stallCooldownKey("stall-user", "Barbell Row")));
afterEach(cleanup);
it("requires a deliberate tap and dismisses on Program", () => {
  render(<ProgramStallReview exercises={exercises} />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  const row = screen.getByRole("button", {
    name: /review recent lifting progress/i,
  });
  // It names the lift and where it has held, and reads as a row to tap.
  expect(row).toHaveTextContent("Barbell Row has held at 60 kg for 3 sessions");
  expect(row.querySelector("svg")).not.toBeNull();
  fireEvent.click(row);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Close review" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("retains the existing three-week cooldown", () => {
  writeString(
    stallCooldownKey("stall-user", "Barbell Row"),
    String(Date.now() - 20 * 86400000)
  );
  render(<ProgramStallReview exercises={exercises} />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
