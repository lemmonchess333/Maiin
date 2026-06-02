import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AdaptiveWarmupBar from "../AdaptiveWarmupBar";

describe("AdaptiveWarmupBar", () => {
  it("renders the personalizing label and the rounded percentage", () => {
    render(<AdaptiveWarmupBar fraction={0.5} stalled={false} />);
    expect(screen.getByText("Personalizing your metabolism")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
  });

  it("shows the keep-logging nudge only when stalled", () => {
    const { rerender } = render(
      <AdaptiveWarmupBar fraction={0.6} stalled={false} />
    );
    expect(screen.queryByText(/keep logging/i)).toBeNull();

    rerender(<AdaptiveWarmupBar fraction={0.6} stalled={true} />);
    expect(screen.getByText(/keep logging/i)).toBeTruthy();
  });

  it("clamps the percentage to 0..100", () => {
    const { rerender } = render(
      <AdaptiveWarmupBar fraction={-0.2} stalled={false} />
    );
    expect(screen.getByText("0%")).toBeTruthy();
    rerender(<AdaptiveWarmupBar fraction={1.5} stalled={false} />);
    expect(screen.getByText("100%")).toBeTruthy();
  });
});
