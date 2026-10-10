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

/* These components read the display unit, which resolves from the auth
   profile — and `useAuth` throws outside an AuthProvider, which none of
   these render inside. Mocking the one-export hook rather than `@/lib/auth`
   keeps the blast radius at one symbol: a bare factory mock of `auth` would
   leave its other exports undefined and fail at some unrelated call site.
   Metric is the app default, so the existing assertions are unaffected. */
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));

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
  config: { targetDistanceKm: 5 },
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

  it("Customise fires onCustomize", () => {
    const { onCustomize } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Customise/i }));
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

  /* Run20 (1): with no pace to prescribe, a tempo and an interval session
     say how they should feel where a pace would be. */
  describe("a quality session with no pace", () => {
    const tempo: RunTemplate = {
      id: "tempo_20",
      name: "20 Min Tempo",
      type: "tempo",
      icon: "Zap",
      description: "5 min warmup → 20 min tempo → 5 min cooldown",
      estimatedDuration: 30,
      config: {},
    };
    const intervals: RunTemplate = {
      id: "5x1k",
      name: "5×1K Intervals",
      type: "intervals",
      icon: "RefreshCw",
      description: "5 reps of 1 km with 90s rest",
      estimatedDuration: 35,
      config: {},
    };

    it("a tempo says comfortably hard", () => {
      setup({ workout: tempo, prefill: { activityType: "tempo" } });
      expect(screen.getByText("Comfortably hard")).toBeInTheDocument();
    });

    it("an interval session says hard, and even", () => {
      setup({
        workout: intervals,
        prefill: {
          activityType: "intervals",
          intervals: {
            reps: 5,
            workDistance: 1000,
            restDuration: 90,
            warmupDuration: 600,
            cooldownDuration: 300,
          },
        },
      });
      expect(screen.getByText("5 × 1K")).toBeInTheDocument();
      expect(
        screen.getByText("Hard, and even across every rep")
      ).toBeInTheDocument();
    });

    it("a tempo with a pace shows the pace, not the words", () => {
      setup({
        workout: tempo,
        prefill: {
          activityType: "tempo",
          target: { type: "pace", value: 320 },
        },
      });
      expect(screen.getByText("5:20 /km")).toBeInTheDocument();
      expect(screen.queryByText("Comfortably hard")).not.toBeInTheDocument();
    });
  });
});
