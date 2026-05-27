/**
 * PR-setup: SessionStructureView contract.
 *
 * Pinned here:
 *   - intervals with warmup + cooldown render 3 blocks (Warm-up,
 *     main reps line, Cool-down) in order.
 *   - intervals without warmup/cooldown render only the main line.
 *   - main line includes reps × distance and the pace suffix when
 *     workPace is set; omits the pace suffix when not set.
 *   - guided workout renders one block per segment with the segment
 *     label and the formatted duration in minutes.
 */
import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import SessionStructureView from "../SessionStructureView";
import type { GuidedRunWorkout } from "@/lib/guidedRun";

afterEach(() => cleanup());

describe("SessionStructureView — intervals", () => {
  it("renders warmup + main + cooldown blocks with pace suffix", () => {
    render(
      <SessionStructureView
        kind="intervals"
        intervals={{
          reps: 5,
          workDistance: 1000,
          workPace: 270,
          restDuration: 90,
          warmupDuration: 600,
          cooldownDuration: 300,
        }}
      />
    );
    expect(screen.getByText("Warm-up")).toBeInTheDocument();
    expect(screen.getByText("10 min easy")).toBeInTheDocument();
    expect(screen.getByText("5 × 1K @ 4:30/km")).toBeInTheDocument();
    expect(
      screen.getByText("1m 30s recovery between reps")
    ).toBeInTheDocument();
    expect(screen.getByText("Cool-down")).toBeInTheDocument();
    expect(screen.getByText("5 min easy")).toBeInTheDocument();
  });

  it("omits warmup + cooldown when not set, and pace when missing", () => {
    render(
      <SessionStructureView
        kind="intervals"
        intervals={{
          reps: 4,
          workDistance: 400,
          restDuration: 60,
        }}
      />
    );
    expect(screen.queryByText("Warm-up")).not.toBeInTheDocument();
    expect(screen.queryByText("Cool-down")).not.toBeInTheDocument();
    expect(screen.getByText("4 × 400m")).toBeInTheDocument();
    expect(screen.getByText("1m recovery between reps")).toBeInTheDocument();
  });
});

describe("SessionStructureView — guided", () => {
  it("renders one block per segment with formatted duration", () => {
    const workout: GuidedRunWorkout = {
      id: "test",
      name: "Test",
      description: "test workout",
      totalMinutes: 30,
      difficulty: "easy",
      color: "#22c55e",
      segments: [
        {
          type: "warmup",
          durationSeconds: 300,
          label: "Warm Up",
          instruction: "Easy jog",
        },
        {
          type: "easy",
          durationSeconds: 1200,
          label: "Easy Run",
          instruction: "Conversational pace",
        },
        {
          type: "cooldown",
          durationSeconds: 300,
          label: "Cool Down",
          instruction: "Walk to finish",
        },
      ],
    };
    render(<SessionStructureView kind="guided" workout={workout} />);
    expect(screen.getByText("Warm Up")).toBeInTheDocument();
    expect(screen.getByText("5 min · Easy jog")).toBeInTheDocument();
    expect(screen.getByText("Easy Run")).toBeInTheDocument();
    expect(
      screen.getByText("20 min · Conversational pace")
    ).toBeInTheDocument();
    expect(screen.getByText("Cool Down")).toBeInTheDocument();
    expect(screen.getByText("5 min · Walk to finish")).toBeInTheDocument();
  });
});
