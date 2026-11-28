// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import PlateauCoachingNotice from "../PlateauCoachingNotice";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

describe("PlateauCoachingNotice", () => {
  it("renders a calm plateau note and triggers swap and dismiss callbacks", () => {
    const onSwap = vi.fn();
    const onDismiss = vi.fn();
    render(
      <PlateauCoachingNotice
        exerciseName="Bench Press"
        onSwap={onSwap}
        onDismiss={onDismiss}
      />
    );

    expect(
      screen.getByRole("note", { name: "Plateau note for Bench Press" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Stalled across a couple of cycles/)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Swap variation" }));
    expect(onSwap).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
