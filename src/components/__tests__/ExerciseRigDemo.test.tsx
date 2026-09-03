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
type TestBeat = {
  t: number;
  label: string;
  cue: string;
  image?: string;
};
const beatsRef = { current: null as readonly TestBeat[] | null };
const legendRef = {
  current: {
    primary: ["Chest"],
    secondary: ["Triceps", "Front delts"],
    colors: { primary: "#7B72E9", secondary: "#9590E0" },
  },
};
/* Partial mocks are not an option here — the module is the rig, and its
   real render would need the whole figure. Every export the component
   imports must therefore be listed, which is exactly the trap CLAUDE.md
   names: adding an import to a component breaks a suite that mocks its
   module wholesale, and the failure surfaces at the CALL SITE. */
vi.mock("@/lib/bodyRig", () => ({
  getBodyDemo: () => demoRef.current,
  getFormBeats: () => beatsRef.current,
  getDemoLegend: () => legendRef.current,
  renderBodyDemo: (id: string, t: number, effort?: number) => {
    drawLog.push({ t, effort });
    return `<svg data-demo="${id}" data-t="${t}"></svg>`;
  },
}));

import { PLACARD_TIMING } from "@/lib/exerciseTempo";
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
  beatsRef.current = null;
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

  it("a cycle demo opens at t=0, cues the steady rhythm, and never runs backwards", () => {
    // A gait, a pedal stroke, a jump-and-step-down: the rep player's
    // there-and-back would walk a treadmill backwards.
    reduceRef.current = false;
    demoRef.current = { concentricTo: 1, cycle: true, cycleMs: 1000 };
    const { container } = render(
      <ExerciseRigDemo exerciseId="treadmill" name="Treadmill" />
    );
    expect(container.querySelector('[data-t="0"]')).not.toBeNull();
    expect(screen.getByText("Set")).toBeInTheDocument();
    step(40);
    for (let now = 700; now <= 2400; now += 1000 / 30) step(now);
    expect(screen.getByText("Steady rhythm")).toBeInTheDocument();
    expect(screen.queryByText("Lower under control")).toBeNull();
    const ts = drawLog.map((d) => d.t);
    // Monotonic between wraps: every decrease is a wrap back near 0,
    // and there are wraps (the cycle repeats).
    let wraps = 0;
    for (let i = 1; i < ts.length; i++) {
      if (ts[i] < ts[i - 1]) {
        wraps++;
        expect(ts[i]).toBeLessThan(0.1);
      }
    }
    expect(wraps).toBeGreaterThan(0);
    expect(Math.max(...ts)).toBeGreaterThan(0.9);
  });

  it("a cycle's reduced-motion two-up shows t=0 and its opposite phase t=0.5", () => {
    reduceRef.current = true;
    demoRef.current = { concentricTo: 1, cycle: true };
    const { container } = render(
      <ExerciseRigDemo exerciseId="treadmill" name="Treadmill" />
    );
    const frames = [...container.querySelectorAll("[data-t]")].map((n) =>
      n.getAttribute("data-t")
    );
    expect(frames).toEqual(["0", "0.5"]);
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

  /* ── Placard mode (2026-09-03) ──────────────────────────────────────
   * The third player: named positions, each held long enough to read
   * its cue, tweening between them — a gym form card animated rather
   * than printed.
   *
   * The clock is DERIVED from PLACARD_TIMING, not written out. The
   * first draft hard-coded a 2160 ms slot; the hold then moved 1600 →
   * 1800 (it is a read budget, and seven words at four a second is
   * 1750), and two of these tests started asserting the wrong
   * position at the right time. The full suite caught it — a
   * single-file run before the constant changed did not. */
  const SLOT = PLACARD_TIMING.holdMs + PLACARD_TIMING.moveMs;
  const PLACARD_BEATS: TestBeat[] = [
    { t: 0, label: "Top position", cue: "Arms locked, chest tall." },
    { t: 0.5, label: "Mid descent", cue: "Elbows travel back." },
    { t: 1, label: "Bottom position", cue: "Upper arms parallel." },
  ];

  it("a placard opens on its FIRST named position, captioned", () => {
    reduceRef.current = false;
    beatsRef.current = PLACARD_BEATS;
    const { container } = render(
      <ExerciseRigDemo exerciseId="dips" name="Dips" />
    );
    expect(container.querySelector('[data-t="0"]')).not.toBeNull();
    // The position's name and its cue, under the figure — the point of
    // the style. Not the rep player's generic phase word.
    expect(screen.getByText("Top position")).toBeInTheDocument();
    expect(screen.getByText("Arms locked, chest tall.")).toBeInTheDocument();
    expect(screen.queryByText("Set")).toBeNull();
    expect(screen.queryByText("Lower under control")).toBeNull();
    // The muscle key — what the purple on the figure means.
    expect(screen.getByText("Chest")).toBeInTheDocument();
    expect(screen.getByText("Front delts")).toBeInTheDocument();
  });

  it("it HOLDS on a position, then tweens to the next", () => {
    reduceRef.current = false;
    beatsRef.current = PLACARD_BEATS;
    render(<ExerciseRigDemo exerciseId="dips" name="Dips" />);
    step(40);
    // Anywhere inside the hold the frame is beat 0 EXACTLY — a still,
    // which is what makes the cue readable.
    step(PLACARD_TIMING.holdMs * 0.5);
    step(PLACARD_TIMING.holdMs - 40);
    expect(drawLog.every((d) => d.t === 0)).toBe(true);
    expect(screen.getByText("Top position")).toBeInTheDocument();
    // Into the tween: between beat 0 and beat 1, and the caption still
    // names the position being LEFT, not the one being approached.
    drawLog.length = 0;
    step(PLACARD_TIMING.holdMs + 100);
    expect(drawLog[0].t).toBeGreaterThan(0);
    expect(drawLog[0].t).toBeLessThan(0.5);
    expect(screen.getByText("Top position")).toBeInTheDocument();
    // Next slot: settled on beat 1, captioned as beat 1.
    drawLog.length = 0;
    step(SLOT + 100);
    expect(drawLog[0].t).toBe(0.5);
    expect(screen.getByText("Mid descent")).toBeInTheDocument();
    expect(screen.getByText("Elbows travel back.")).toBeInTheDocument();
  });

  it("the sequence wraps back to the first position and repeats", () => {
    reduceRef.current = false;
    beatsRef.current = PLACARD_BEATS;
    render(<ExerciseRigDemo exerciseId="dips" name="Dips" />);
    step(40);
    step(2 * SLOT + 100); // third slot → the bottom
    expect(screen.getByText("Bottom position")).toBeInTheDocument();
    // Past the last slot it is back on the first position — a loop,
    // not a settle.
    step(3 * SLOT + 100);
    expect(screen.getByText("Top position")).toBeInTheDocument();
    expect(rafQueue.length).toBeGreaterThan(0);
  });

  it("effort brightens on the way to the finished position, not away", () => {
    // concentricTo 0: t=0 IS the finished position, so travelling
    // DOWNWARD in t is the drive. The rep player reads this off a named
    // phase; a placard has only the direction of travel.
    reduceRef.current = false;
    beatsRef.current = PLACARD_BEATS;
    demoRef.current = { concentricTo: 0 };
    render(<ExerciseRigDemo exerciseId="dips" name="Dips" />);
    step(40);
    drawLog.length = 0;
    step(PLACARD_TIMING.holdMs + 100); // tween 0 → 0.5: away from the finish
    const lowering = drawLog[0].effort!;
    expect(drawLog[0].t).toBeGreaterThan(0); // really mid-tween, not a hold
    drawLog.length = 0;
    // The wrap tween: the last beat (t=1) travelling back to the first
    // (t=0) — toward the finish, so this is the press.
    step(2 * SLOT + PLACARD_TIMING.holdMs + 100);
    const pressing = drawLog[0].effort!;
    expect(drawLog[0].t).toBeLessThan(1);
    expect(pressing).toBeGreaterThan(lowering);
  });

  it("reduced motion prints every position with its own caption", () => {
    // An animation that steps through six frames HAS six frames to
    // print — so the still version is the card it came from, not a
    // two-up that drops four of them.
    reduceRef.current = true;
    beatsRef.current = PLACARD_BEATS;
    const { container } = render(
      <ExerciseRigDemo exerciseId="dips" name="Dips" />
    );
    const frames = [...container.querySelectorAll("[data-t]")].map((n) =>
      n.getAttribute("data-t")
    );
    expect(frames).toEqual(["0", "0.5", "1"]);
    for (const b of PLACARD_BEATS) {
      expect(screen.getByText(b.label)).toBeInTheDocument();
      expect(screen.getByText(b.cue)).toBeInTheDocument();
    }
    expect(rafQueue.length).toBe(0);
    reduceRef.current = false;
  });

  /* ── Supplied frames ─────────────────────────────────────────────
   * The owner's own card, cut into six. Where every position carries a
   * picture the pictures ARE the animation and the rig is the fallback
   * for when they cannot load. */
  const FRAMED: TestBeat[] = PLACARD_BEATS.map((b, i) => ({
    ...b,
    image: `form-frames/dips/${i + 1}.webp`,
  }));

  it("supplied frames replace the drawn figure entirely", () => {
    reduceRef.current = false;
    beatsRef.current = FRAMED;
    const { container } = render(
      <ExerciseRigDemo exerciseId="dips" name="Dips" />
    );
    /* Queried by TAG, not by role: every frame but the current one is
       `alt=""` + aria-hidden, which is role `presentation` — correctly,
       since six stacked copies of one figure must not read as six
       images to a screen reader. */
    const frames = [...container.querySelectorAll("img")];
    expect(frames).toHaveLength(3);
    // The current position is the visible one.
    expect(frames[0]).toHaveStyle({ opacity: "1" });
    expect(frames[1]).toHaveStyle({ opacity: "0" });
    // And the rig never draws: the loop's only job here is the index.
    step(40);
    step(900);
    expect(drawLog).toHaveLength(0);
  });

  it("the visible frame follows the position", () => {
    reduceRef.current = false;
    beatsRef.current = FRAMED;
    const { container } = render(
      <ExerciseRigDemo exerciseId="dips" name="Dips" />
    );
    step(40);
    step(SLOT + 100);
    expect(screen.getByText("Mid descent")).toBeInTheDocument();
    const frames = [...container.querySelectorAll("img")];
    expect(frames[0]).toHaveStyle({ opacity: "0" });
    expect(frames[1]).toHaveStyle({ opacity: "1" });
  });

  it("a frame that cannot load falls back to the drawn figure", () => {
    /* The pictures live under public/ and are fetched at runtime, so
       "the file is in the repo" is not the same claim as "the user got
       it" — a bad deploy, an offline first visit, or a stale service
       worker all end the same way. The beat's own `t` is what the rig
       falls back TO, which is why a framed beat still carries one. */
    reduceRef.current = false;
    beatsRef.current = FRAMED;
    const { container } = render(
      <ExerciseRigDemo exerciseId="dips" name="Dips" />
    );
    const first = container.querySelector("img")!;
    act(() => {
      first.dispatchEvent(new Event("error", { bubbles: false }));
    });
    step(40);
    step(900);
    // The rig is drawing again, at the beat's own t.
    expect(drawLog.length).toBeGreaterThan(0);
    expect(drawLog[drawLog.length - 1].t).toBe(0);
    expect(screen.getByText("Top position")).toBeInTheDocument();
  });

  it("reduced motion prints the supplied frames, not the drawn ones", () => {
    reduceRef.current = true;
    beatsRef.current = FRAMED;
    const { container } = render(
      <ExerciseRigDemo exerciseId="dips" name="Dips" />
    );
    const frames = [...container.querySelectorAll("img")];
    expect(frames).toHaveLength(3);
    expect(drawLog).toHaveLength(0);
    for (const b of FRAMED) {
      expect(screen.getByText(b.cue)).toBeInTheDocument();
    }
    reduceRef.current = false;
  });

  it("a demo with no beats is untouched by any of it", () => {
    // The style is opt-in per exercise: everything without a beat list
    // still plays the two-way rep with its phase cues.
    reduceRef.current = false;
    beatsRef.current = null;
    render(<ExerciseRigDemo exerciseId="squat" name="Barbell Squat" />);
    expect(screen.getByText("Set")).toBeInTheDocument();
    expect(screen.queryByText("Primary")).toBeNull();
  });
});
