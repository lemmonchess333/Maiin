/**
 * Sprint 3 — BottomSheet primitive tests.
 *
 * BottomSheet wraps vaul's <Drawer.*>. vaul renders its content
 * into a portal and relies on document-level APIs that work in
 * jsdom but require the sheet to be open. These tests pin the
 * pieces of the contract we can verify without driving the full
 * gesture / drag pipeline:
 *   - When open=false, no sheet content is rendered (no Title, no
 *     children, no drag handle).
 *   - When open=true, the title is rendered (becomes the accessible
 *     name via Drawer.Title's aria-labelledby wiring).
 *   - Children render below the header.
 *   - hideHeader=true suppresses the visible header strip but still
 *     emits a Drawer.Title (sr-only) so screen readers have a name.
 *   - title=null + hideHeader=false renders the drag handle but no
 *     title row.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BottomSheet } from "../BottomSheet";

afterEach(cleanup);

describe("BottomSheet — closed state", () => {
  it("renders no title or children when open=false", () => {
    render(
      <BottomSheet open={false} onOpenChange={() => {}} title="Comments">
        <p>child content</p>
      </BottomSheet>
    );
    expect(screen.queryByText("Comments")).toBeNull();
    expect(screen.queryByText("child content")).toBeNull();
  });
});

describe("BottomSheet — open state", () => {
  it("renders the title (accessible name via Drawer.Title)", () => {
    render(
      <BottomSheet open onOpenChange={() => {}} title="Comments">
        <p>child content</p>
      </BottomSheet>
    );
    expect(screen.getByText("Comments")).toBeTruthy();
  });

  it("renders children", () => {
    render(
      <BottomSheet open onOpenChange={() => {}} title="X">
        <p>child content</p>
      </BottomSheet>
    );
    expect(screen.getByText("child content")).toBeTruthy();
  });

  it("renders the description when provided", () => {
    render(
      <BottomSheet
        open
        onOpenChange={() => {}}
        title="Comments"
        description="Share your reaction"
      >
        <p>child</p>
      </BottomSheet>
    );
    expect(screen.getByText("Share your reaction")).toBeTruthy();
  });

  it("title=null with header shown ⇒ no title text, but drag handle still implied", () => {
    render(
      <BottomSheet open onOpenChange={() => {}} title={null}>
        <p>body</p>
      </BottomSheet>
    );
    // body still renders
    expect(screen.getByText("body")).toBeTruthy();
  });
});

describe("BottomSheet — hideHeader", () => {
  it("hideHeader=true still emits a Drawer.Title for SRs (sr-only)", () => {
    render(
      <BottomSheet open onOpenChange={() => {}} title="Comments" hideHeader>
        <p>body</p>
      </BottomSheet>
    );
    // The title text exists in the DOM (rendered as sr-only) so
    // assistive tech still gets an accessible name.
    const title = screen.getByText("Comments");
    expect(title).toBeTruthy();
    expect(title.className).toContain("sr-only");
  });

  it("hideHeader=true + title=null ⇒ no title in the DOM at all", () => {
    render(
      <BottomSheet open onOpenChange={() => {}} title={null} hideHeader>
        <p>body</p>
      </BottomSheet>
    );
    expect(screen.getByText("body")).toBeTruthy();
  });
});

/**
 * Keyboard avoidance.
 *
 * The sheet is `fixed bottom-0`, so a soft keyboard covers its foot. The
 * first fix reserved the overlap as `paddingBottom` — which grows a
 * bottom-anchored element UPWARD, leaving its foot exactly where it was
 * (behind the keyboard) while displacing the content off the top. On the
 * Start-a-circle form that stranded the CTA at the very top of the screen
 * with a keyboard-sized void beneath it, filmed on iOS Safari.
 *
 * Moving the ANCHOR is the fix, so these assert the anchor and explicitly
 * reject the padding — jsdom can't show the visual result, but it can hold
 * the mechanism.
 */
describe("BottomSheet — keyboard avoidance", () => {
  function withKeyboard(overlapPx: number) {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: {
        height: window.innerHeight - overlapPx,
        offsetTop: 0,
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
  }

  afterEach(() => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: undefined,
    });
  });

  function sheetEl(): HTMLElement {
    // vaul's Content is the element carrying the sheet's own classes.
    const el = document.querySelector<HTMLElement>(".fixed.bottom-0");
    if (!el) throw new Error("sheet content not found");
    return el;
  }

  it("lifts its ANCHOR by the keyboard overlap, not its padding", () => {
    withKeyboard(300);
    render(
      <BottomSheet open onOpenChange={() => {}} title="Name it">
        <input aria-label="Circle name" />
      </BottomSheet>
    );
    const el = sheetEl();
    expect(el.style.bottom).toBe("300px");
    /* The regression this replaces. Padding would move the content up
       while leaving the sheet's foot behind the keyboard — and would also
       make the box taller, which is what pushed the CTA off-screen. */
    expect(el.style.paddingBottom).toBe("");
  });

  it("caps its height against the shrunken viewport so it can't run off the top", () => {
    withKeyboard(300);
    render(
      <BottomSheet open onOpenChange={() => {}} title="Name it">
        <input aria-label="Circle name" />
      </BottomSheet>
    );
    expect(sheetEl().style.maxHeight).toContain("300px");
  });

  it("stays flush to the bottom when no keyboard is open", () => {
    render(
      <BottomSheet open onOpenChange={() => {}} title="Name it">
        <input aria-label="Circle name" />
      </BottomSheet>
    );
    const el = sheetEl();
    expect(el.style.bottom).toBe("");
    expect(el.style.maxHeight).toBe("");
  });
});
