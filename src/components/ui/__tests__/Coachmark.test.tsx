import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
});

