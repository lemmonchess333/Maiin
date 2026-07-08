/**
 * RunLaunchCard contract (run fast-launch arc). Pins the planned one-tap
 * launch surface: identity + metric + eyebrow, and the three actions
 * (Start / Customize / Back). ShoeSelector is stubbed to keep this off the
 * Firestore/router path. See spec `spec-run-fast-launch.md` §4.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import RunLaunchCard from "../RunLaunchCard";
import type { RunTemplate } from "@/lib/workoutTemplates";

vi.mock("../ShoeSelector", () => ({
  default: () => <div data-testid="shoe" />,
}));

afterEach(() => cleanup());

const workout: RunTemplate = {
  id: "easy_30",
  name: "Easy 30",
  type: "easy",
  icon: "person-standing",
  description: "Conversational pace — recovery day",
  estimatedDuration: 30,
  config: { targetDistance: 5 },
};

function setup(
  overrides: Partial<React.ComponentProps<typeof RunLaunchCard>> = {}
) {
  const onStart = vi.fn();
  const onCustomize = vi.fn();
  const onBack = vi.fn();
  const onSelectShoe = vi.fn();
  render(
    <RunLaunchCard
      workout={workout}
      prefill={{
        activityType: "easy",
        target: { type: "distance", value: 5000 },
      }}
      strip={null}
      isExtra={false}
      selectedShoeId={null}
      onSelectShoe={onSelectShoe}
      onStart={onStart}
      onCustomize={onCustomize}
      onBack={onBack}
      {...overrides}
    />
  );
  return { onStart, onCustomize, onBack };
}

describe("RunLaunchCard", () => {
  it("renders the workout name, distance metric and default eyebrow", () => {
    setup();
    expect(screen.getByText("Easy 30")).toBeInTheDocument();
    expect(screen.getByText("5 km")).toBeInTheDocument();
    expect(screen.getByText("Today · Run day")).toBeInTheDocument();
  });

  it("Start fires onStart once", () => {
    const { onStart } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Start Easy 30/i }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("Customize fires onCustomize", () => {
    const { onCustomize } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Customize/i }));
    expect(onCustomize).toHaveBeenCalledTimes(1);
  });

  it("Back fires onBack", () => {
    const { onBack } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows the 'Extra run' eyebrow when isExtra is true", () => {
    setup({ isExtra: true });
    expect(screen.getByText("Extra run")).toBeInTheDocument();
    expect(screen.queryByText("Today · Run day")).not.toBeInTheDocument();
  });
});
