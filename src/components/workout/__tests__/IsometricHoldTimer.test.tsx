import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

const hapticMock = vi.fn();
vi.mock("@/lib/haptic", () => ({
  haptic: (...args: unknown[]) => hapticMock(...args),
}));
vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => true }));

import IsometricHoldTimer from "../IsometricHoldTimer";

describe("IsometricHoldTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T10:00:00Z"));
    hapticMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("counts hold duration from wall clock, cues once at target, and applies elapsed seconds", () => {
    const onApply = vi.fn();
    render(<IsometricHoldTimer targetSeconds={10} onApplySeconds={onApply} />);

    expect(screen.getByTestId("hold-timer-readout")).toHaveTextContent("0s");

    fireEvent.click(screen.getByRole("button", { name: "Start hold" }));
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(screen.getByTestId("hold-timer-readout")).toHaveTextContent("6s");
    expect(hapticMock).not.toHaveBeenCalledWith("medium");

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByTestId("hold-timer-readout")).toHaveTextContent("11s");
    expect(hapticMock).toHaveBeenCalledWith("medium");

    fireEvent.click(screen.getByRole("button", { name: "Use 11s" }));
    expect(onApply).toHaveBeenCalledWith(11);

    fireEvent.click(screen.getByRole("button", { name: "Reset hold timer" }));
    expect(screen.getByTestId("hold-timer-readout")).toHaveTextContent("0s");
  });
});
