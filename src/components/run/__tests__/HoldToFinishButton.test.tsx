/**
 * HoldToFinishButton contract (run fast-launch arc, PR-B). Pins the two paths
 * that keep the active-run end affordance safe:
 *   - a completed hold ends the run directly (onFinish) and swallows the
 *     trailing click, so it never also opens the confirm dialog;
 *   - a tap / keyboard / screen-reader activation opens the confirm dialog
 *     (onRequestConfirm) — the accessible + accidental-safe path;
 *   - releasing before the threshold aborts silently (no finish).
 * rAF + performance.now are stubbed so the hold is deterministic.
 * See spec `spec-run-fast-launch.md` §12.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import HoldToFinishButton from "../HoldToFinishButton";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

let now = 0;
let raf: FrameRequestCallback[] = [];

beforeEach(() => {
  now = 0;
  raf = [];
  vi.stubGlobal("performance", { now: () => now });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    raf.push(cb);
    return raf.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function flush() {
  const cb = raf.shift();
  if (cb) cb(0);
}

function setup() {
  const onFinish = vi.fn();
  const onRequestConfirm = vi.fn();
  render(
    <HoldToFinishButton
      onFinish={onFinish}
      onRequestConfirm={onRequestConfirm}
      holdMs={1500}
    />
  );
  return {
    onFinish,
    onRequestConfirm,
    btn: screen.getByRole("button", { name: "Hold to finish run" }),
  };
}

describe("HoldToFinishButton", () => {
  it("a completed hold finishes directly and swallows the trailing click", () => {
    const { onFinish, onRequestConfirm, btn } = setup();
    fireEvent.pointerDown(btn);
    now = 1600; // past holdMs
    flush(); // frame runs → progress 1 → onFinish
    expect(onFinish).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(btn);
    fireEvent.click(btn); // trailing click must NOT open the dialog
    expect(onRequestConfirm).not.toHaveBeenCalled();
  });

  it("a tap (release before threshold) opens the confirm dialog, not finish", () => {
    const { onFinish, onRequestConfirm, btn } = setup();
    fireEvent.pointerDown(btn);
    now = 200; // well short of the hold threshold
    fireEvent.pointerUp(btn); // cancel
    flush(); // any scheduled frame is now a no-op (start cleared)
    fireEvent.click(btn);
    expect(onRequestConfirm).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("keyboard/AT activation (click with no hold) opens the confirm dialog", () => {
    const { onFinish, onRequestConfirm, btn } = setup();
    fireEvent.click(btn);
    expect(onRequestConfirm).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("sliding off (pointer leave) before the threshold aborts silently", () => {
    const { onFinish, btn } = setup();
    fireEvent.pointerDown(btn);
    now = 500;
    fireEvent.pointerLeave(btn);
    flush();
    now = 2000;
    flush();
    expect(onFinish).not.toHaveBeenCalled();
  });
});

describe("Label in Name (WCAG 2.5.3)", () => {
  /* The visible label and the accessible name have to share their words, or
     a voice-control user reading "HOLD" off the screen says a phrase the
     control does not answer to. This one used to be named "Finish run" —
     zero overlap, and the only control in the run cluster that broke the
     pattern its siblings keep. Asserted as containment rather than equality
     so the name can stay more descriptive than the label. */
  it("the accessible name contains the visible label", () => {
    render(
      <HoldToFinishButton
        onFinish={vi.fn()}
        onRequestConfirm={vi.fn()}
        holdMs={1500}
      />
    );
    const btn = screen.getByRole("button");
    const visible = "HOLD";
    const accessible = btn.getAttribute("aria-label") ?? "";
    expect(screen.getByText(visible)).toBeInTheDocument();
    expect(accessible.toLowerCase()).toContain(visible.toLowerCase());
  });
});
