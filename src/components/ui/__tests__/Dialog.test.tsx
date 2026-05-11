/**
 * Sprint 3 — Dialog primitive tests.
 *
 * Pins the contract that callers depend on:
 *   - role + aria-modal
 *   - title becomes aria-labelledby + visible heading
 *   - description becomes aria-describedby
 *   - escape key dismisses (when closeOnEscape, default true)
 *   - backdrop click dismisses (when closeOnBackdrop, default true)
 *   - body scroll lock applied/released
 *   - returns null markup when !open
 *   - closeButton renders an aria-labelled Close button
 *   - role override to "alertdialog"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Dialog } from "../Dialog";

afterEach(() => {
  cleanup();
  // Defensive: some tests assert body.style.overflow; reset after.
  document.body.style.overflow = "";
});

describe("Dialog — open/closed rendering", () => {
  it("renders nothing when open=false", () => {
    render(
      <Dialog open={false} onClose={() => {}} title="X">
        body
      </Dialog>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the dialog when open=true", () => {
    render(
      <Dialog open onClose={() => {}} title="End run?">
        body
      </Dialog>,
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("Dialog — a11y wiring", () => {
  it("sets role=dialog by default", () => {
    render(
      <Dialog open onClose={() => {}} title="X">
        body
      </Dialog>,
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("supports role=alertdialog override", () => {
    render(
      <Dialog open onClose={() => {}} title="X" role="alertdialog">
        body
      </Dialog>,
    );
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("sets aria-modal=true", () => {
    render(
      <Dialog open onClose={() => {}} title="X">
        body
      </Dialog>,
    );
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
  });

  it("title is rendered as a visible heading AND wired via aria-labelledby", () => {
    render(
      <Dialog open onClose={() => {}} title="End run?">
        body
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    const heading = document.getElementById(labelledBy!);
    expect(heading?.textContent).toBe("End run?");
  });

  it("description is rendered AND wired via aria-describedby", () => {
    render(
      <Dialog
        open
        onClose={() => {}}
        title="X"
        description="This will discard your in-progress run."
      >
        body
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    const describedBy = dialog.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      "This will discard your in-progress run.",
    );
  });

  it("no description ⇒ no aria-describedby", () => {
    render(
      <Dialog open onClose={() => {}} title="X">
        body
      </Dialog>,
    );
    expect(screen.getByRole("dialog").getAttribute("aria-describedby")).toBeNull();
  });
});

describe("Dialog — dismissal paths", () => {
  it("escape key calls onClose by default", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="X">
        body
      </Dialog>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closeOnEscape=false disables the escape handler", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="X" closeOnEscape={false}>
        body
      </Dialog>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("backdrop click calls onClose by default", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="X">
        body
      </Dialog>,
    );
    fireEvent.click(screen.getByRole("presentation"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closeOnBackdrop=false makes the backdrop non-dismissive", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="X" closeOnBackdrop={false}>
        body
      </Dialog>,
    );
    fireEvent.click(screen.getByRole("presentation"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("close button (when present) calls onClose", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="X" closeButton>
        body
      </Dialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("no close button by default", () => {
    render(
      <Dialog open onClose={() => {}} title="X">
        body
      </Dialog>,
    );
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });
});

describe("Dialog — body scroll lock", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
  });

  it("locks body overflow while open", () => {
    render(
      <Dialog open onClose={() => {}} title="X">
        body
      </Dialog>,
    );
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("restores the previous overflow value when closed", () => {
    const { rerender } = render(
      <Dialog open onClose={() => {}} title="X">
        body
      </Dialog>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    rerender(
      <Dialog open={false} onClose={() => {}} title="X">
        body
      </Dialog>,
    );
    expect(document.body.style.overflow).toBe("");
  });
});

describe("Dialog — content", () => {
  it("renders children in the body area", () => {
    render(
      <Dialog open onClose={() => {}} title="X">
        <p>custom body content</p>
      </Dialog>,
    );
    expect(screen.getByText("custom body content")).toBeTruthy();
  });
});
