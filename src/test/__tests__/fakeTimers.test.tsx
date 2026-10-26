/**
 * restoreRealTimers leaves framer-motion's frame loop open.
 *
 * The first test fakes the clock and unmounts an entrance animation
 * halfway. The second renders another and waits for it to finish. With a
 * plain `cleanup(); vi.useRealTimers();` in the first, the second stays at
 * `opacity: 0` and times out: the latch the six suites that fake timers
 * around motion components could each leave behind. The two run in written
 * order, which is the point; under a shuffle they would still pass.
 */
import { describe, it, expect, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { motion } from "framer-motion";
import { restoreRealTimers } from "../fakeTimers";

function Entrance({ label }: { label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {label}
    </motion.div>
  );
}

describe("restoreRealTimers", () => {
  it("restores the clock from the middle of an animation", async () => {
    vi.useFakeTimers();
    render(<Entrance label="first" />);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    await restoreRealTimers();
    expect(vi.isFakeTimers()).toBe(false);
  });

  it("leaves a later entrance animation free to finish", async () => {
    render(<Entrance label="second" />);
    await waitFor(() => expect(screen.getByText("second")).toBeVisible(), {
      timeout: 2000,
    });
  });

  it("does nothing when the clock is already real", async () => {
    render(<Entrance label="third" />);
    await restoreRealTimers();
    expect(screen.getByText("third")).toBeInTheDocument();
  });
});
