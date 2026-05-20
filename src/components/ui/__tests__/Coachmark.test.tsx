import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import Coachmark from "../Coachmark";

/* Coachmark composes Tooltip + useCoachMarks. Tooltip behaviour is
 * tested separately; here we pin the composition: persistence via
 * localStorage, auto-dismiss timing, and the no-show-after-dismissed
 * contract.
 *
 * Real timers — fake timers + framer-motion's AnimatePresence exit
 * animation interact badly under jsdom. A short autoDismissMs + waitFor
 * is more reliable. */

const STORAGE_KEY = "tropos-coach-marks-dismissed:test-coachmark-v1";

describe("Coachmark", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("opens on first mount when not previously dismissed", () => {
    render(
      <Coachmark storageKey="test-coachmark-v1" content="Hint copy">
        <button>Anchor</button>
      </Coachmark>,
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
        <button>Anchor</button>
      </Coachmark>,
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
        <button>Anchor</button>
      </Coachmark>,
    );
    expect(screen.queryByRole("tooltip")).toBeNull();
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
        <button>Anchor</button>
      </Coachmark>,
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
        <button>Anchor</button>
      </Coachmark>,
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
        <button>Anchor</button>
      </Coachmark>,
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

