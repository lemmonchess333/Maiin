/**
 * ExerciseRigDemo — form-animation pass pins.
 *
 *   1. Reduced motion renders the static two-up (start + end extremes),
 *      no cue line, no replay control, no rAF loop.
 *   2. The animated path opens on the "Set" cue — the lead-in hold that
 *      keeps the figure still until the eye finds it (the rep used to
 *      start moving on the very first frame).
 *   3. The figure div carries the initial lockout frame markup.
 *
 * The full phase timeline is pinned in exerciseTempo.test.ts against the
 * pure repSampleAt — no rAF mocking here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

const reduceRef = { current: false };
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => reduceRef.current,
}));

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

// Every animated draw is recorded so tests can compare full sequences.
const drawLog: Array<{ t: number; effort: number | undefined }> = [];
vi.mock("@/lib/bodyRig", () => ({
  getBodyDemo: () => ({ concentricTo: 0 }),
  renderBodyDemo: (id: string, t: number, effort?: number) => {
    drawLog.push({ t, effort });
    return `<svg data-demo="${id}" data-t="${t}"></svg>`;
  },
}));

import ExerciseRigDemo from "../ExerciseRigDemo";

/* Controllable rAF harness (the WaterWave pattern): callbacks queue up
 * and step(now) drives exactly one frame at an explicit clock value. */
const rafQueue: FrameRequestCallback[] = [];
let clock = 0;

function step(now: number) {
  clock = now;
  const cbs = rafQueue.splice(0);
  act(() => {
    for (const cb of cbs) cb(now);
  });
}

beforeEach(() => {
  rafQueue.length = 0;
  drawLog.length = 0;
  clock = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(performance, "now").mockImplementation(() => clock);
});

describe("ExerciseRigDemo", () => {
  it("reduced motion → static two-up, no cue, no replay", () => {
    reduceRef.current = true;
    const { container } = render(
      <ExerciseRigDemo exerciseId="squat" name="Barbell Squat" />
    );
    expect(
      screen.getByRole("img", { name: /start and end positions/i })
    ).toBeInTheDocument();
    // Both extremes render (t=0 and t=1).
    expect(container.querySelector('[data-t="0"]')).not.toBeNull();
    expect(container.querySelector('[data-t="1"]')).not.toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/set|lower under control/i)).toBeNull();
    reduceRef.current = false;
  });

  it("animated path opens on the Set lead-in cue with the lockout frame", () => {
    reduceRef.current = false;
    const { container } = render(
      <ExerciseRigDemo exerciseId="squat" name="Barbell Squat" />
    );
    expect(
      screen.getByRole("img", { name: /one guided rep/i })
    ).toBeInTheDocument();
    // The teaching rep leads in with "Set" — not already mid-eccentric.
    expect(screen.getByText("Set")).toBeInTheDocument();
    // concentricTo 0 → lockout at t=0; the initial frame is the lockout.
    expect(container.querySelector('[data-t="0"]')).not.toBeNull();
    // No replay control until the rep is done.
    expect(screen.queryByRole("button", { name: /replay/i })).toBeNull();
  });

  it("a replayed rep reproduces the first run's exact draw sequence", () => {
    reduceRef.current = false;
    render(<ExerciseRigDemo exerciseId="squat" name="Barbell Squat" />);

    // Drive the first rep: a few mid-rep frames (spaced past the 30fps
    // throttle so each one draws), then completion.
    const runFrames = (startAt: number) => {
      const before = drawLog.length;
      for (const offset of [40, 800, 1600, 2400]) step(startAt + offset);
      step(startAt + 60_000); // way past total → settle + "done"
      return drawLog.slice(before);
    };

    const first = runFrames(0);
    expect(screen.getByText("Rep complete")).toBeInTheDocument();

    // Replay from a much later absolute clock — stale refs would make the
    // effort low-pass (and thus the highlight) start from leftover state.
    // The clock advances BEFORE the click so the new effect's start time
    // matches the frames driven below.
    clock = 100_000;
    fireEvent.click(screen.getByRole("button", { name: /replay/i }));
    const second = runFrames(100_000);

    // Deterministic replay: identical (t, effort) sequence, frame for frame.
    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThan(2);
  });

  it("completes exactly one bounded run — no rAF after settle", () => {
    reduceRef.current = false;
    render(<ExerciseRigDemo exerciseId="squat" name="Barbell Squat" />);
    step(60_000); // first frame already past total
    expect(screen.getByText("Rep complete")).toBeInTheDocument();
    // The settle frame must not schedule another frame.
    expect(rafQueue.length).toBe(0);
  });
});
