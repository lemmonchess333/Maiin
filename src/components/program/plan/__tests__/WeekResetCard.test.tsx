import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import WeekResetCard from "../WeekResetCard";
import type { PlanFeel } from "@/lib/momentumCheckin";

function card(
  overrides: Partial<Parameters<typeof WeekResetCard>[0]> & {
    feel?: PlanFeel;
  } = {}
) {
  const props = {
    feel: "a_bit_much" as PlanFeel,
    range: "2 Nov – 8 Nov",
    liftDays: 3,
    plannedRuns: 2,
    runPlan: "race" as const,
    expressTarget: "/program?day=1&express=1",
    canMoveRun: true,
    canEditLayout: true,
    outcome: null,
    onMoveRun: vi.fn(),
    onEditLayout: vi.fn(),
    onGoToday: vi.fn(),
    onReviewWeek: vi.fn(),
    onOpen: vi.fn(),
    ...overrides,
  };
  render(<WeekResetCard {...props} />);
  return props;
}

const names = () =>
  within(screen.getByRole("region", { name: "Make this week fit" }))
    .getAllByRole("button")
    .map((button) => button.textContent);

describe("WeekResetCard", () => {
  it("labels each button with one action", () => {
    card();
    expect(
      screen.getByRole("button", { name: "Keep this week" })
    ).toBeInTheDocument();
    for (const button of screen.getAllByRole("button"))
      expect(button.textContent).not.toContain("·");
  });

  it("a bit much: a shorter lift or a lighter run plan, then a run move, before the layout", () => {
    const props = card();
    expect(names()).toEqual([
      "Use this week's Express session",
      "Make the run plan lighter",
      "Move a run this week",
      "Change usual weekly layout",
      "Keep this week",
    ]);
    fireEvent.click(
      screen.getByRole("button", { name: "Use this week's Express session" })
    );
    expect(props.onOpen).toHaveBeenCalledWith("/program?day=1&express=1");
    fireEvent.click(
      screen.getByRole("button", { name: "Make the run plan lighter" })
    );
    expect(props.onOpen).toHaveBeenLastCalledWith("/settings/run-plan");
  });

  it("too light: the run plan's difficulty and volume", () => {
    card({ feel: "too_light" });
    expect(names()).toEqual([
      "Make the run plan harder",
      "Change usual weekly layout",
      "Keep this week",
    ]);
  });

  it("offers no run actions to someone with no run plan", () => {
    card({ runPlan: "none", plannedRuns: 0 });
    expect(names()).toEqual([
      "Use this week's Express session",
      "Change usual weekly layout",
      "Keep this week",
    ]);
    expect(screen.queryByText(/planned runs/)).toBeNull();
  });
});
