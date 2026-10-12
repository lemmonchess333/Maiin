import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const motionPref = vi.hoisted(() => ({ reduce: false }));
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => motionPref.reduce,
}));

import SetCheck from "../SetCheck";

/** The tick at the end of a set row (Pol1): the box pops and the check
 *  draws when a set is ticked on screen, and nowhere else. */
describe("SetCheck", () => {
  beforeEach(() => {
    motionPref.reduce = false;
  });

  function check(completed: boolean, best = false) {
    const onComplete = vi.fn();
    const onEdit = vi.fn();
    const props = {
      editLabel: "Edit completed set 1",
      best,
      onComplete,
      onEdit,
    };
    const view = render(<SetCheck completed={completed} {...props} />);
    const tick = () => view.rerender(<SetCheck completed {...props} />);
    const untick = () =>
      view.rerender(<SetCheck completed={false} {...props} />);
    return { ...view, onComplete, onEdit, tick, untick };
  }

  /* framer writes a mark's starting values inline as it mounts: a box
     that pops starts at 0.72 and a check that draws starts with none of
     its stroke shown. */
  const mark = () => screen.getByTestId("set-check-mark");
  const pops = () => (mark().getAttribute("style") ?? "").includes("0.72");

  it("completes the set from the empty box, and opens a done set to correct it", () => {
    const { onComplete, onEdit, tick } = check(false);
    fireEvent.click(screen.getByRole("button", { name: "Mark set complete" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    tick();
    fireEvent.click(
      screen.getByRole("button", { name: "Edit completed set 1" })
    );
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("pops the box when the set is ticked on screen", () => {
    const { tick } = check(false);
    tick();
    expect(pops()).toBe(true);
  });

  it("shows a check that was already there without popping it", () => {
    // A resumed session, or a return to an earlier exercise, mounts its
    // done sets: they were ticked before, not now.
    check(true);
    // Anchored: the mark is there; it just does not move.
    expect(mark()).toBeInTheDocument();
    expect(pops()).toBe(false);
  });

  it("pops again when an undone set is ticked again", () => {
    const { tick, untick } = check(false);
    tick();
    untick();
    expect(
      screen.getByRole("button", { name: "Mark set complete" })
    ).toBeInTheDocument();
    tick();
    expect(pops()).toBe(true);
  });

  it("shows the check without moving under Reduce Motion", () => {
    motionPref.reduce = true;
    const { tick } = check(false);
    tick();
    expect(mark()).toBeInTheDocument();
    expect(pops()).toBe(false);
  });

  it("marks a set that holds a best", () => {
    check(true, true);
    expect(
      screen.getByRole("button", { name: "Edit completed set 1" })
    ).toHaveTextContent("PR");
  });
});
