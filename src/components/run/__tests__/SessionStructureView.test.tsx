/**
 * STRUCT-SESS-01: SessionStructureView contract, over the canonical
 * `SessionSegment[]` (runSegments.ts).
 *
 * Pinned here:
 *   - the component is a single map over segments — one block per
 *     segment, in order, colored by segment type;
 *   - interval sessions render per-rep rows (the row count IS the
 *     honest preview), with the pace suffix when workPace is set;
 *   - guided workouts render label + duration + instruction;
 *   - empty segments render nothing.
 */
import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import SessionStructureView from "../SessionStructureView";
import { segmentsFromGuided, segmentsFromIntervals } from "@/lib/runSegments";
import type { GuidedRunWorkout } from "@/lib/guidedRun";

afterEach(() => cleanup());

describe("SessionStructureView — intervals", () => {
  it("renders warmup, per-rep work/recovery rows, and cooldown in order", () => {
    render(
      <SessionStructureView
        segments={segmentsFromIntervals(
          {
            reps: 5,
            workDistance: 1000,
            workPace: 270,
            restDuration: 90,
            warmupDuration: 600,
            cooldownDuration: 300,
          },
          "km"
        )}
      />
    );
    expect(screen.getByText("Warm-up")).toBeInTheDocument();
    expect(screen.getByText("10 min · Easy jogging")).toBeInTheDocument();
    // Per-rep rows: 5 work rows with the pace suffix, 4 recoveries.
    expect(screen.getAllByText("1K @ 4:30/km")).toHaveLength(5);
    expect(screen.getByText(/Rep 1 of 5/)).toBeInTheDocument();
    expect(screen.getAllByText("Recover")).toHaveLength(4);
    expect(screen.getByText("Cool-down")).toBeInTheDocument();
    expect(screen.getByText("5 min · Easy jogging")).toBeInTheDocument();
  });

  it("omits warmup + cooldown when not set, and pace when missing", () => {
    render(
      <SessionStructureView
        segments={segmentsFromIntervals(
          {
            reps: 4,
            workDistance: 400,
            restDuration: 60,
          },
          "km"
        )}
      />
    );
    expect(screen.queryByText("Warm-up")).not.toBeInTheDocument();
    expect(screen.queryByText("Cool-down")).not.toBeInTheDocument();
    expect(screen.getAllByText("400m")).toHaveLength(4);
    expect(screen.getAllByText("Recover")).toHaveLength(3);
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
    render(<SessionStructureView segments={segmentsFromGuided(workout)} />);
    expect(screen.getByText("Warm Up")).toBeInTheDocument();
    expect(screen.getByText("5 min · Easy jog")).toBeInTheDocument();
    expect(screen.getByText("Easy Run")).toBeInTheDocument();
    expect(
      screen.getByText("20 min · Conversational pace")
    ).toBeInTheDocument();
    expect(screen.getByText("Cool Down")).toBeInTheDocument();
    expect(screen.getByText("5 min · Walk to finish")).toBeInTheDocument();
  });

  it("renders nothing for empty segments", () => {
    const { container } = render(<SessionStructureView segments={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
