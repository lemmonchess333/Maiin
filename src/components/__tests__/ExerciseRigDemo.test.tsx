/**
 * ExerciseRigDemo — looping form-demo pins.
 *
 *   1. Reduced motion renders the static two-up (start + end extremes),
 *      no cue line, no rAF loop.
 *   2. The animated path opens on the "Set" cue — the lead-in hold that
 *      keeps the figure still until the eye finds it — with the lockout
 *      frame as the first paint.
 *   3. The rep LOOPS: past the first full cycle the cue returns to the
 *      eccentric and frames keep scheduling — "Rep complete" and the
 *      replay control are gone (the Demo1 single-rep settle was
 *      superseded by owner feedback 2026-07-27: reps must repeat like
 *      the demo screens on gym equipment).
 *   4. The 30fps throttle advances in WHOLE intervals, so draw times are
 *      evenly spaced against a 60Hz rAF. The old `= now` re-anchor made
 *      spacing alternate ~33/50ms — the "reps spaz out" judder.
 *
 * The phase timeline itself is pinned in exerciseTempo.test.ts against
 * the pure repSampleLoopedAt — no rAF mocking there.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

const reduceRef = { current: false };
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => reduceRef.current,
}));

// Every animated draw is recorded so tests can compare full sequences.
const drawLog: Array<{ t: number; effort: number | undefined }> = [];
const demoRef = { current: { concentricTo: 0 } as Record<string, unknown> };
vi.mock("@/lib/bodyRig", () => ({
  getBodyDemo: () => demoRef.current,
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
  demoRef.current = { concentricTo: 0 };
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
  it("reduced motion → static two-up, no cue, no loop", () => {
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
    expect(rafQueue.length).toBe(0);
    reduceRef.current = false;
  });

  it("animated path opens on the Set lead-in cue with the lockout frame", () => {
    reduceRef.current = false;
    const { container } = render(
      <ExerciseRigDemo exerciseId="squat" name="Barbell Squat" />
    );
    expect(
      screen.getByRole("img", { name: /looping reps/i })
    ).toBeInTheDocument();
    // The loop leads in with "Set" — not already mid-eccentric.
    expect(screen.getByText("Set")).toBeInTheDocument();
    // concentricTo 0 → lockout at t=0; the initial frame is the lockout.
    expect(container.querySelector('[data-t="0"]')).not.toBeNull();
    // No replay control exists anywhere in the looping player.
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("the rep loops — no settle, no Rep complete, frames keep coming", () => {
    reduceRef.current = false;
    render(<ExerciseRigDemo exerciseId="squat" name="Barbell Squat" />);
    // Default timing: SET 600 + (1650 ecc + 480 pause + 1050 drive +
    // 480 lockout) = 600 + 3660 cycle.
    step(40);
    step(2350); // 600 + 1650 + 100 → bottom pause
    expect(screen.getByText("Pause")).toBeInTheDocument();
    step(3230); // mid-drive
    expect(screen.getByText("Drive up")).toBeInTheDocument();
    // Past one full cycle: the cue is back on the eccentric — the loop
    // wrapped instead of settling.
    step(600 + 3660 + 300);
    expect(screen.getByText("Lower under control")).toBeInTheDocument();
    expect(screen.queryByText("Rep complete")).toBeNull();
    // Far past the old single-rep total, the loop is still scheduling.
    step(60_000);
    expect(rafQueue.length).toBeGreaterThan(0);
    expect(screen.queryByText("Rep complete")).toBeNull();
  });

  it("a phase change never repaints the initial lockout frame (the one-frame flash)", () => {
    // Owner device recording 2026-09-02: at every cue change the figure
    // snapped to the lockout pose for a frame. The cue is React state,
    // so a phase change re-rendered the player, and React 19 re-applied
    // the figure's dangerouslySetInnerHTML (a fresh object each render)
    // — overwriting the live frame with the INITIAL svg until the next
    // tick. This drives mid-rep, crosses a phase boundary, and asserts
    // the figure still shows the last DRAWN frame, not the initial one.
    reduceRef.current = false;
    const { container } = render(
      <ExerciseRigDemo exerciseId="squat" name="Barbell Squat" />
    );
    step(40);
    step(1500); // mid-eccentric: the live frame is t≈0.55, not 0
    expect(container.querySelector('[data-t="0"]')).toBeNull();
    step(2350); // → pause: draws t=1, then cues → React re-render
    expect(screen.getByText("Pause")).toBeInTheDocument();
    expect(container.querySelector('[data-t="1"]')).not.toBeNull();
    expect(container.querySelector('[data-t="0"]')).toBeNull();
  });

  it("a stretch-start demo opens at the BOTTOM and drives first", () => {
    // `concentricTo` says which end finishes the lift, not where it
    // begins. A squat and a deadlift both lock out standing; the squat
    // starts there, the deadlift starts with the bar on the floor. The
    // player opened every demo at lockout, so the deadlift demo began
    // with the lift already done (owner, 2026-09-02).
    reduceRef.current = false;
    demoRef.current = { concentricTo: 0, startsAt: "stretch" };
    const { container } = render(
      <ExerciseRigDemo exerciseId="deadlift" name="Deadlift" />
    );
    // concentricTo 0 → lockout at t=0, so the stretched end is t=1.
    expect(container.querySelector('[data-t="1"]')).not.toBeNull();
    expect(container.querySelector('[data-t="0"]')).toBeNull();
    expect(screen.getByText("Set")).toBeInTheDocument();
    step(40);
    // First motion is the DRIVE, not the lower.
    step(900);
    expect(screen.getByText("Drive up")).toBeInTheDocument();
    expect(screen.queryByText("Lower under control")).toBeNull();
  });

  it("reduced motion shows the START frame first", () => {
    // The two-up is start → finish, so a deadlift reads floor-then-
    // standing rather than the reverse.
    reduceRef.current = true;
    demoRef.current = { concentricTo: 0, startsAt: "stretch" };
    const { container } = render(
      <ExerciseRigDemo exerciseId="deadlift" name="Deadlift" />
    );
    const frames = [...container.querySelectorAll("[data-t]")].map((n) =>
      n.getAttribute("data-t")
    );
    expect(frames).toEqual(["1", "0"]);
    reduceRef.current = false;
  });

  it("draw spacing is even under a 60Hz rAF (quantized 30fps steps)", () => {
    reduceRef.current = false;
    render(<ExerciseRigDemo exerciseId="squat" name="Barbell Squat" />);
    // Drive a 60Hz clock through the middle of the eccentric and read
    // the drawn t values: with quantized stepping every accepted draw
    // lands on the 33.33ms grid, so consecutive t deltas are constant.
    for (let now = 700; now <= 1600; now += 1000 / 60) step(now);
    const ts = drawLog.map((d) => d.t).filter((t) => t > 0.05 && t < 0.6);
    expect(ts.length).toBeGreaterThan(7);
    const deltas = ts.slice(1).map((t, i) => t - ts[i]);
    // Even spacing: no delta more than 1.6× the smallest. The old
    // `= now` re-anchor alternated 16.7/50ms (ratio 3) — judder.
    const min = Math.min(...deltas);
    const max = Math.max(...deltas);
    expect(max / min).toBeLessThan(1.6);
  });
});
