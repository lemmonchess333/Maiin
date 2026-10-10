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
  it("Run21 (3): carries what the run is and how it should feel, closed", () => {
    setup({ purpose: "Easy day — it makes the hard days work." });
    const why = screen.getByText("Why this run").closest("details")!;
    expect(why).not.toHaveAttribute("open");
    expect(why).toHaveTextContent(
      /What it is.*Relaxed running at a chatty pace/
    );
    expect(why).toHaveTextContent(
      /Why it's in your week.*it makes the hard days work/
    );
    expect(why).toHaveTextContent(/If it feels wrong.*Slow down/);
  });

  it("Run21 (2): names a long run's race-pace finish, on the card and its Start", () => {
    setup({
      workout: {
        id: "long_15k",
        name: "Long 15K",
        type: "long",
        icon: "mountain",
        description: "Easy-to-moderate effort, time on feet",
        estimatedDuration: 85,
        config: { targetDistanceKm: 15 },
      },
      racePaceFinish: { blockKm: 5, goalPaceS: 300 },
      purpose:
        "It rehearses race day on tired legs: your pace, your fuelling and your focus.",
    });
    expect(
      screen.getByRole("heading", { name: "Long 15K with race pace" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Start Long 15K with race pace/ })
    ).toBeInTheDocument();
    // Its size and pace, which the name and lines leave out.
    expect(screen.getByText("Last 5 km at 5:00 /km")).toBeInTheDocument();
    const why = screen.getByText("Why this run").closest("details")!;
    expect(why).toHaveTextContent(
      /What it is.*finishing at your goal race pace/
    );
    expect(why).toHaveTextContent(/If it feels wrong.*Run the rest easy/);
  });

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
});
