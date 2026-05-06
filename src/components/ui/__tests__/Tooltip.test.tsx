import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import Tooltip from "../Tooltip";

/* Tooltip pins behaviour we cannot afford to regress: portal escape,
 * aria-describedby wiring (screen-reader correctness), and the dismiss
 * paths (outside tap + escape + anchor re-tap). Positioning math is
 * delegated to @floating-ui/react and not re-tested here — that's
 * floating-ui's contract. */

describe("Tooltip", () => {
  beforeEach(() => {
    /* Each test starts with a clean DOM. matchMedia stub from setup
       persists, so prefers-reduced-motion=false is the default. */
  });

  it("does not render the body until the anchor is tapped", () => {
    render(
      <Tooltip content="Body copy">
        <button>Anchor</button>
      </Tooltip>,
    );
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens on anchor click and renders the body via portal", () => {
    render(
      <Tooltip content="Body copy">
        <button>Anchor</button>
      </Tooltip>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Anchor" }));
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("Body copy");
    /* Portal target is document.body (not the test container) — the
       tooltip should render outside the original render root. */
    expect(tip.parentElement).toBe(document.body);
  });

  it("wires aria-describedby between anchor and body when open", () => {
    render(
      <Tooltip content="Body copy">
        <button>Anchor</button>
      </Tooltip>,
    );
    const anchor = screen.getByRole("button", { name: "Anchor" });
    expect(anchor.getAttribute("aria-describedby")).toBeNull();

    fireEvent.click(anchor);

    const describedBy = anchor.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(screen.getByRole("tooltip").getAttribute("id")).toBe(describedBy);
  });

  it("toggles closed when the anchor is tapped again", async () => {
    render(
      <Tooltip content="Body copy">
        <button>Anchor</button>
      </Tooltip>,
    );
    const anchor = screen.getByRole("button", { name: "Anchor" });
    fireEvent.click(anchor);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.click(anchor);
    /* AnimatePresence exit is async — flush microtasks. */
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("closes on Escape key press", async () => {
    render(
      <Tooltip content="Body copy">
        <button>Anchor</button>
      </Tooltip>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Anchor" }));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("respects controlled `open` prop", () => {
    const { rerender } = render(
      <Tooltip content="Body copy" open={false}>
        <button>Anchor</button>
      </Tooltip>,
    );
    expect(screen.queryByRole("tooltip")).toBeNull();

    rerender(
      <Tooltip content="Body copy" open>
        <button>Anchor</button>
      </Tooltip>,
    );
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    /* The dismiss-via-outside-tap → onOpenChange wiring is floating-
       ui's contract; we rely on its tests rather than re-asserting it
       under jsdom where pointer-event simulation is fragile. */
  });
});
