/**
 * The Run screen's step shell heads each step with its effort (Run21 (1)),
 * including a session saved before steps carried a heading: a run resumed
 * mid-session plays the segments it was started with.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import IntervalStepShell from "../IntervalStepShell";
import type { SessionPlayer } from "@/hooks/useSessionPlayer";
import type { SessionSegment } from "@/lib/runSegments";

vi.mock("@/hooks/useDistanceUnit", () => ({ useDistanceUnit: () => "km" }));

afterEach(cleanup);

function playerAt(segments: SessionSegment[], index: number): SessionPlayer {
  return {
    state: { index, phaseElapsed: 0, phaseDistanceCovered: 0 },
    segments,
    current: segments[index] ?? null,
    next: segments[index + 1] ?? null,
    isComplete: false,
    start: vi.fn(),
    tick: vi.fn(),
    skip: vi.fn(),
    workPortion: () => null,
  };
}

const step = (
  type: SessionSegment["type"],
  extra: Partial<SessionSegment> = {}
): SessionSegment => ({
  type,
  label: type,
  instruction: "",
  target: { kind: "duration", seconds: 60 },
  ...extra,
});

function headingAt(segments: SessionSegment[], index: number) {
  render(
    <IntervalStepShell player={playerAt(segments, index)} onSkip={vi.fn()} />
  );
  const text = screen.getByText(/^[A-Z][A-Z ·/0-9]+$/).textContent;
  cleanup();
  return text;
}

describe("IntervalStepShell — step headings", () => {
  it("shows the heading a step carries", () => {
    expect(
      headingAt([step("hard", { eyebrow: "QUICK AND RELAXED · REP 1/8" })], 0)
    ).toBe("QUICK AND RELAXED · REP 1/8");
  });

  it("gives a step saved without one its effort, never its type key", () => {
    const legacy = [
      step("warmup"),
      step("moderate"),
      step("moderate", { rep: 2, totalReps: 2 }),
      step("hard", { rep: 3, totalReps: 5 }),
      step("recovery", { rep: 3, totalReps: 5 }),
      step("recovery"),
      step("cooldown"),
    ];
    expect(legacy.map((_, i) => headingAt(legacy, i))).toEqual([
      "EASY",
      "COMFORTABLY HARD",
      "COMFORTABLY HARD · BLOCK 2/2",
      "HARD · REP 3/5",
      "EASY · AFTER REP 3/5",
      "EASY",
      "EASY",
    ]);
  });
});
