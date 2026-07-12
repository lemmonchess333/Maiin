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
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const reduceRef = { current: false };
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => reduceRef.current,
}));

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

vi.mock("@/lib/bodyRig", () => ({
  getBodyDemo: () => ({ concentricTo: 0 }),
  renderBodyDemo: (id: string, t: number) =>
    `<svg data-demo="${id}" data-t="${t}"></svg>`,
}));

import ExerciseRigDemo from "../ExerciseRigDemo";

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
});
