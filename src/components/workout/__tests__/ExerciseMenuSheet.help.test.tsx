import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ExerciseMenuSheet from "../ExerciseMenuSheet";
import type { Choice } from "@/components/ui/ChoiceSheet";

vi.mock("@/components/ui/ChoiceSheet", () => ({
  ChoiceSheet: ({ choices }: { choices: Choice[] }) => (
    <>
      {choices.map((choice) => (
        <button key={choice.id} onClick={() => void choice.onSelect()}>
          {choice.label}
        </button>
      ))}
    </>
  ),
}));
afterEach(cleanup);

it.each([false, true])(
  "offers workout help even when skipped=%s without changing the workout",
  (skipped) => {
    const help = vi.fn();
    const mutation = vi.fn();
    render(
      <ExerciseMenuSheet
        open
        onClose={vi.fn()}
        exerciseName="Squat"
        nothingDone={false}
        skipped={skipped}
        onHelp={help}
        onSkip={mutation}
        onUnskip={mutation}
        onSwapBack={mutation}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "How to log a workout" })
    );
    expect(help).toHaveBeenCalledTimes(1);
    expect(mutation).not.toHaveBeenCalled();
  }
);
