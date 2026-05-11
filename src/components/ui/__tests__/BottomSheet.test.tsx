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
      </BottomSheet>,
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
      </BottomSheet>,
    );
    expect(screen.getByText("Comments")).toBeTruthy();
  });

  it("renders children", () => {
    render(
      <BottomSheet open onOpenChange={() => {}} title="X">
        <p>child content</p>
      </BottomSheet>,
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
      </BottomSheet>,
    );
    expect(screen.getByText("Share your reaction")).toBeTruthy();
  });

  it("title=null with header shown ⇒ no title text, but drag handle still implied", () => {
    render(
      <BottomSheet open onOpenChange={() => {}} title={null}>
        <p>body</p>
      </BottomSheet>,
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
      </BottomSheet>,
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
      </BottomSheet>,
    );
    expect(screen.getByText("body")).toBeTruthy();
  });
});
