import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import Tooltip from "../Tooltip";

vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: vi.fn(() => false),
}));

import { useReducedMotion } from "@/hooks/useReducedMotion";

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
        <button type="button">Anchor</button>
      </Tooltip>
    );
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens on anchor click and renders the body via portal", () => {
    render(
      <Tooltip content="Body copy">
        <button type="button">Anchor</button>
      </Tooltip>
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
        <button type="button">Anchor</button>
      </Tooltip>
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
        <button type="button">Anchor</button>
      </Tooltip>
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
        <button type="button">Anchor</button>
      </Tooltip>
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
        <button type="button">Anchor</button>
      </Tooltip>
    );
    expect(screen.queryByRole("tooltip")).toBeNull();

    rerender(
      <Tooltip content="Body copy" open>
        <button type="button">Anchor</button>
      </Tooltip>
    );
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    /* The dismiss-via-outside-tap → onOpenChange wiring is floating-
       ui's contract; we rely on its tests rather than re-asserting it
       under jsdom where pointer-event simulation is fragile. */
  });

  /* QA backlog automations (CLAUDE.md "Pre-launch QA backlog") —
     covers what's tractable in jsdom. Visual checks (light/dark,
     iOS Safari rubber-band) stay manual. */

  it("body width is capped at max-w-[280px] so narrow viewports don't overflow", () => {
    render(
      <Tooltip content="Body copy">
        <button type="button">Anchor</button>
      </Tooltip>
    );
    fireEvent.click(screen.getByRole("button", { name: "Anchor" }));
    expect(screen.getByRole("tooltip").className).toContain("max-w-[280px]");
  });

  it("portal renders at z-40 — sits above bottom nav (z-30) but BELOW vaul drawers (z-50)", () => {
    render(
      <Tooltip content="Body copy">
        <button type="button">Anchor</button>
      </Tooltip>
    );
    fireEvent.click(screen.getByRole("button", { name: "Anchor" }));
    /* Drawers (vaul) use z-50; bottom nav uses z-30. The tooltip MUST
       sit between those layers — an open drawer should occlude an
       open tooltip but the nav should not. */
    expect(screen.getByRole("tooltip").className).toContain("z-40");
  });

  it("prefers-reduced-motion suppresses the slide animation (y offset = 0)", () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    render(
      <Tooltip content="Body copy">
        <button type="button">Anchor</button>
      </Tooltip>
    );
    fireEvent.click(screen.getByRole("button", { name: "Anchor" }));
    const tip = screen.getByRole("tooltip");
    /* framer-motion sets `transform` from the `initial` → `animate`
       values. Under reduced-motion, initial.y is 0 (no slide),
       leaving only the opacity fade. The transform style ends up
       without a translate3d offset on the y axis. */
    const transform = tip.style.transform ?? "";
    expect(transform).not.toMatch(
      /translateY\(4px\)|translate3d\([^,]+,\s*4px/
    );
    vi.mocked(useReducedMotion).mockReturnValue(false);
  });

  it("keyboard flow: Tab focuses anchor, Enter opens, Escape closes, focus returns to anchor", async () => {
    render(
      <Tooltip content="Body copy">
        <button type="button">Anchor</button>
      </Tooltip>
    );
    const anchor = screen.getByRole("button", { name: "Anchor" });
    anchor.focus();
    expect(document.activeElement).toBe(anchor);

    /* Enter on a focused <button type="button"> triggers a click in the browser; in
       jsdom we simulate the click directly (same path floating-ui's
       useClick listens on). */
    fireEvent.click(anchor);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
    /* Anchor stays focused — the tooltip body is portaled and never
       stole focus on open, so closing returns to the natural focus. */
    expect(document.activeElement).toBe(anchor);
  });
});
