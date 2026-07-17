/**
 * SOCIAL-FOCUS-01 — CircleWeeklyFocusSheet contract: all six focuses
 * render as a radio group ordered by Circle type, the primary label
 * follows check-in state ("Set weekly focus" → "Update focus"), the
 * plain check-in escape hatch exists only before the first check-in,
 * and submit passes the chosen enum value (or null).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import CircleWeeklyFocusSheet from "../CircleWeeklyFocusSheet";
import { WEEKLY_FOCUS_LABELS } from "@/features/goalSpace/weeklyFocus";

afterEach(() => cleanup());

function setup(
  overrides: Partial<React.ComponentProps<typeof CircleWeeklyFocusSheet>> = {}
) {
  const onSubmit = vi.fn();
  render(
    <CircleWeeklyFocusSheet
      open
      onOpenChange={vi.fn()}
      circleType="race"
      currentFocus={null}
      hasCheckedIn={false}
      busy={false}
      onSubmit={onSubmit}
      {...overrides}
    />
  );
  return { onSubmit };
}

describe("CircleWeeklyFocusSheet", () => {
  it("offers all six focuses as radios, Circle-type-relevant first", () => {
    setup({ circleType: "race" });
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(6);
    expect(radios[0]).toHaveTextContent(WEEKLY_FOCUS_LABELS.running);
    for (const label of Object.values(WEEKLY_FOCUS_LABELS)) {
      expect(screen.getByRole("radio", { name: label })).toBeInTheDocument();
    }
  });

  it("submits the selected focus", () => {
    const { onSubmit } = setup();
    fireEvent.click(
      screen.getByRole("radio", { name: WEEKLY_FOCUS_LABELS.recovery })
    );
    fireEvent.click(screen.getByRole("button", { name: "Set weekly focus" }));
    expect(onSubmit).toHaveBeenCalledWith("recovery");
  });

  it("requires a selection before the primary action enables", () => {
    setup();
    expect(
      screen.getByRole("button", { name: "Set weekly focus" })
    ).toBeDisabled();
  });

  it("offers a plain check-in only before the first check-in of the week", () => {
    const { onSubmit } = setup();
    fireEvent.click(
      screen.getByRole("button", { name: "Check in without a focus" })
    );
    expect(onSubmit).toHaveBeenCalledWith(null);

    cleanup();
    setup({ hasCheckedIn: true, currentFocus: "running" });
    expect(
      screen.queryByRole("button", { name: "Check in without a focus" })
    ).toBeNull();
  });

  it("in change mode: preselects the current focus and disables an unchanged submit", () => {
    setup({ hasCheckedIn: true, currentFocus: "strength" });
    expect(
      screen.getByRole("radio", { name: WEEKLY_FOCUS_LABELS.strength })
    ).toHaveAttribute("aria-checked", "true");
    const update = screen.getByRole("button", { name: "Update focus" });
    expect(update).toBeDisabled();
    fireEvent.click(
      screen.getByRole("radio", { name: WEEKLY_FOCUS_LABELS.balanced })
    );
    expect(update).toBeEnabled();
  });
});
