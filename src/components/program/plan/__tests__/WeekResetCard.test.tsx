import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import WeekResetCard from "../WeekResetCard";

describe("WeekResetCard", () => {
  it("labels each button with one action", () => {
    render(
      <WeekResetCard
        feel="a_bit_much"
        range="2 Nov – 8 Nov"
        liftDays={3}
        plannedRuns={2}
        canMoveRun
        canEditLayout
        outcome={null}
        onMoveRun={vi.fn()}
        onEditLayout={vi.fn()}
        onGoToday={vi.fn()}
        onReviewWeek={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: "Keep this week" })
    ).toBeInTheDocument();
    for (const button of screen.getAllByRole("button"))
      expect(button.textContent).not.toContain("·");
  });
});
