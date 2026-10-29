/**
 * The form guide in a sheet, as Train's drawings and the workout's
 * "How to" open it.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ExerciseFormSheet from "../ExerciseFormSheet";

vi.mock("@/components/ExerciseFormContent", () => ({
  default: ({
    exerciseName,
    active,
    compactGuide,
  }: {
    exerciseName: string;
    active: boolean;
    compactGuide: boolean;
  }) => (
    <div
      data-testid="form-content"
      data-active={String(active)}
      data-compact={String(compactGuide)}
    >
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

  it("scrolls the guide inside the sheet", async () => {
    /* The muscles, steps and common mistakes sat below the sheet's foot,
       out of reach, with nothing to scroll. */
    render(
      <ExerciseFormSheet
        exerciseName="Lateral Raise"
        open
        onOpenChange={() => {}}
      />
    );
    const guide = await screen.findByTestId("form-content");
    expect(guide.closest(".overflow-y-auto")).not.toBeNull();
  });

  it("uses the compact guide when opened from a live workout", async () => {
    render(
      <ExerciseFormSheet
        exerciseName="Lateral Raise"
        open
        compactGuide
        onOpenChange={() => {}}
      />
    );
    expect(await screen.findByTestId("form-content")).toHaveAttribute(
      "data-compact",
      "true"
    );
  });

  it("sits above the workout screen with its backdrop", () => {
    render(
      <ExerciseFormSheet
        exerciseName="Lateral Raise"
        open
        onOpenChange={() => {}}
      />
    );
    const sheet = screen.getByRole("dialog", { name: "Lateral Raise" });
    expect(sheet.className).toMatch(/(^|\s)z-\[60\](\s|$)/);
    expect(document.querySelector("[data-vaul-overlay]")?.className).toMatch(
      /(^|\s)z-\[60\](\s|$)/
    );
  });
});
