import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from "@testing-library/react";
import Coachmark from "../Coachmark";

/* Coachmark composes Tooltip + useCoachMarks. Tooltip behaviour is
 * tested separately; here we pin the composition: persistence via
 * localStorage, auto-dismiss timing, and the no-show-after-dismissed
 * contract.
 *
 * Real timers, with one exception below. "Fake timers and framer-motion
 * interact badly under jsdom" was the standing explanation here, and the
 * mechanism turns out to be specific and one-way: jsdom drives
 * `requestAnimationFrame` off `setInterval`, so a frame outstanding when
 * a fake clock is handed back strands jsdom's frame counter AND
 * motion-dom's `runNextFrame` flag, and no animation in the file runs
 * again. An AnimatePresence exit that never completes leaves a dismissed
 * tooltip in the DOM. A short autoDismissMs + waitFor sidesteps it; the
 * one test that genuinely needs a controllable clock settles before
 * restoring it. Full mechanism in `WorkoutSessionCompletion.test.tsx`. */

/* `anon:` is the signed-out bucket — this renders without an AuthProvider,
   which `useUidForStorageKey` treats the same way. The prefix is what keeps
   one account's dismissed coach marks from silencing another's on a shared
   device; see useCoachMarks.test.tsx for the isolation cases. */
const STORAGE_KEY = "anon:tropos-coach-marks-dismissed:test-coachmark-v1";

describe("Coachmark", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("opens on first mount when not previously dismissed", () => {
    render(
      <Coachmark storageKey="test-coachmark-v1" content="Hint copy">
        <button type="button">Anchor</button>
      </Coachmark>
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent("Hint copy");
  });

  it("auto-dismisses after autoDismissMs and persists the dismissal", async () => {
    render(
      <Coachmark
        storageKey="test-coachmark-v1"
        content="Hint copy"
        autoDismissMs={50}
      >
        <button type="button">Anchor</button>
      </Coachmark>
    );
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    /* localStorage flips synchronously when dismiss() runs; the DOM
       removal is async (AnimatePresence exit). waitFor handles both. */
    await waitFor(() => {
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe("1");
    });
    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).toBeNull();
    });
  });

  it("does NOT open if the key is already dismissed in localStorage", () => {
    window.localStorage.setItem(STORAGE_KEY, "1");
    render(
      <Coachmark storageKey="test-coachmark-v1" content="Hint copy">
        <button type="button">Anchor</button>
      </Coachmark>
    );
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("keeps the timer deadline across rerenders and calls the latest onDismiss", () => {
    vi.useFakeTimers();
    const callbacks = Array.from({ length: 4 }, () => vi.fn());
    const hint = (index: number) => (
      <Coachmark
        storageKey="test-coachmark-v1"
        content="Hint copy"
        autoDismissMs={100}
        onDismiss={callbacks[index]}
      >
        <button type="button">Anchor</button>
      </Coachmark>
    );
    const { rerender, unmount } = render(hint(0));
    try {
      for (let index = 1; index < callbacks.length; index += 1) {
        act(() => vi.advanceTimersByTime(25));
        rerender(hint(index));
      }
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
      act(() => vi.advanceTimersByTime(25));
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe("1");
      expect(callbacks[3]).toHaveBeenCalledTimes(1);
      for (const callback of callbacks.slice(0, 3)) {
        expect(callback).not.toHaveBeenCalled();
      }
    } finally {
      /* Unmount and tick once more before handing the clock back. jsdom
         drives `requestAnimationFrame` off `setInterval`, which the fake
         clock owns here, and framer-motion holds jsdom's rAF from import
         rather than the global — so leaving with a frame outstanding
         strands jsdom's frame counter above zero AND motion-dom's
         `runNextFrame` flag true, and no later animation in this FILE
         can run. The visible cost was the auto-dismiss test above: its
         AnimatePresence exit never completes, so the tooltip is still
         in the DOM. It only showed under `--sequence.shuffle`, because
         written order puts that test first. The full mechanism is in
         `WorkoutSessionCompletion.test.tsx`. */
      unmount();
      act(() => vi.advanceTimersByTime(100));
      vi.useRealTimers();
    }
  });

  /* onDismiss callback — added when Soc5 wired
     `social_coachmark_dismissed` telemetry. Fires exactly once
     on the FIRST dismissal regardless of path (manual close,
     tap-outside, escape, auto-timer). */

  it("onDismiss fires on auto-dismiss + survives subsequent setState noise", async () => {
    const onDismiss = vi.fn();
    render(
      <Coachmark
        storageKey="test-coachmark-v1"
        content="Hint copy"
        autoDismissMs={50}
        onDismiss={onDismiss}
      >
        <button type="button">Anchor</button>
      </Coachmark>
    );
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
    /* Wait a frame more to confirm no double-fire from the unmount /
       AnimatePresence exit cleanup running dismiss() again. */
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("onDismiss fires on Escape-key dismissal", async () => {
    const onDismiss = vi.fn();
    render(
      <Coachmark
        storageKey="test-coachmark-v1"
        content="Hint copy"
        onDismiss={onDismiss}
      >
        <button type="button">Anchor</button>
      </Coachmark>
    );
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
  });

  it("onDismiss is guarded — never double-fires even if dismiss is re-triggered", async () => {
    const onDismiss = vi.fn();
    render(
      <Coachmark
        storageKey="test-coachmark-v1"
        content="Hint copy"
        onDismiss={onDismiss}
      >
        <button type="button">Anchor</button>
      </Coachmark>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
    /* Second Escape after dismissal — coachmark is already closed,
       the listener stack has detached, and the guard ref in
       Coachmark.dismissAndNotify ensures onDismiss never fires a
       second time. */
    fireEvent.keyDown(document, { key: "Escape" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
