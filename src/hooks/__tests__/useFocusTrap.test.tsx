/**
 * Tests for `useFocusTrap` — the accessibility hook that traps Tab
 * focus inside a modal/dialog while open, and restores focus to the
 * triggering element on close.
 *
 * Pinning: this hook is critical for keyboard a11y on every overlay
 * surface (delete-account modal, vaul drawers, ConfirmDialog,
 * Coachmark). A regression would silently break Tab containment —
 * users could escape the modal via Tab and lose track of where focus
 * landed.
 *
 * What's covered:
 *   1. Initial focus lands on the first focusable element inside the
 *      ref'd container.
 *   2. Tab from the last focusable wraps to the first.
 *   3. Shift+Tab from the first wraps to the last.
 *   4. enabled=false short-circuits — no auto-focus, no key handler.
 *   5. Focus is restored to the previously-focused element on
 *      unmount.
 *   6. Empty container (no focusables) doesn't throw.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { useFocusTrap } from "../useFocusTrap";

function Modal({
  enabled = true,
  hasInputs = true,
}: {
  enabled?: boolean;
  hasInputs?: boolean;
}) {
  const ref = useFocusTrap<HTMLDivElement>(enabled);
  return (
    <div ref={ref} data-testid="modal">
      {hasInputs && (
        <>
          <button data-testid="first">First</button>
          <input data-testid="middle" />
          <button data-testid="last">Last</button>
        </>
      )}
    </div>
  );
}

describe("useFocusTrap — initial focus", () => {
  afterEach(() => cleanup());

  it("focuses the first focusable element on mount", () => {
    const { getByTestId } = render(<Modal />);
    expect(document.activeElement).toBe(getByTestId("first"));
  });

  it("does NOT auto-focus when enabled=false", () => {
    const triggerOutside = document.createElement("button");
    triggerOutside.textContent = "outside";
    document.body.appendChild(triggerOutside);
    triggerOutside.focus();
    expect(document.activeElement).toBe(triggerOutside);

    render(<Modal enabled={false} />);
    /* Focus should stay on the outside button — the trap is a no-op. */
    expect(document.activeElement).toBe(triggerOutside);

    document.body.removeChild(triggerOutside);
  });
});

describe("useFocusTrap — Tab wrap-around", () => {
  afterEach(() => cleanup());

  it("Tab on the last focusable wraps to the first", () => {
    const { getByTestId } = render(<Modal />);
    getByTestId("last").focus();
    expect(document.activeElement).toBe(getByTestId("last"));

    act(() => {
      fireEvent.keyDown(document, { key: "Tab" });
    });

    expect(document.activeElement).toBe(getByTestId("first"));
  });

  it("Shift+Tab on the first focusable wraps to the last", () => {
    const { getByTestId } = render(<Modal />);
    /* getByTestId("first") is already focused on mount. */
    expect(document.activeElement).toBe(getByTestId("first"));

    act(() => {
      fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    });

    expect(document.activeElement).toBe(getByTestId("last"));
  });

  it("Tab in the middle of the trap doesn't fire the wrap (lets browser handle it)", () => {
    /* The hook only intercepts Tab AT the boundaries — middle-of-
       sequence Tab is left to the browser's default. We verify by
       checking the key handler doesn't preventDefault when focused
       on the middle input. */
    const { getByTestId } = render(<Modal />);
    getByTestId("middle").focus();

    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      cancelable: true,
      bubbles: true,
    });
    document.dispatchEvent(event);

    /* preventDefault wasn't called — the browser would handle the
       Tab normally. */
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("useFocusTrap — restore focus on unmount", () => {
  afterEach(() => cleanup());

  it("returns focus to the previously-focused element when unmounted", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open Modal";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(<Modal />);
    /* While mounted, focus is inside the modal. */
    expect(document.activeElement).not.toBe(trigger);

    unmount();
    /* After unmount, focus is restored. */
    expect(document.activeElement).toBe(trigger);

    document.body.removeChild(trigger);
  });
});

describe("useFocusTrap — no focusables", () => {
  afterEach(() => cleanup());

  it("doesn't throw when the container has no focusable children", () => {
    /* An empty modal (mounted before content paints, or stubbed
       during a loading state) should not throw on auto-focus. */
    expect(() => render(<Modal hasInputs={false} />)).not.toThrow();
  });
});
