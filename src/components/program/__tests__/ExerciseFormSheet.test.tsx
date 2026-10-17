/**
 * The form guide in a sheet, as Train's drawings and the workout's
 * "How to" open it.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ExerciseFormSheet from "../ExerciseFormSheet";

vi.mock("@/components/ExerciseFormContent", () => ({
  default: ({ exerciseName, active }: { exerciseName: string; active: boolean }) => (
    <div data-testid="form-content" data-active={String(active)}>
      {exerciseName} guide
    </div>
  ),
}));

describe("ExerciseFormSheet", () => {
  it("titles the sheet with the exercise and shows its guide", async () => {
    render(
      <ExerciseFormSheet
        exerciseName="Lateral Raise"
        open
        onOpenChange={() => {}}
      />
    );
    expect(await screen.findByTestId("form-content")).toHaveTextContent(
      "Lateral Raise guide"
    );
    expect(screen.getByTestId("form-content")).toHaveAttribute(
      "data-active",
      "true"
    );
    expect(
      screen.getByRole("dialog", { name: "Lateral Raise" })
    ).toBeInTheDocument();
  });
});
