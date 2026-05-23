/**
 * Tests for `ConfirmDialog` — the design-system two-button confirm
 * dialog primitive. Thin wrapper around Dialog (focus trap, escape,
 * backdrop click etc are tested in Dialog.test.tsx); ConfirmDialog
 * just composes the destructive vs primary footer.
 *
 * Pins:
 *   1. role="alertdialog" — a confirmation requires response
 *      (WAI-ARIA distinguishes alertdialog from neutral dialog).
 *   2. title + description render.
 *   3. Default labels: "Confirm" + "Cancel".
 *   4. Custom labels override defaults.
 *   5. destructive variant flips the confirm button styling.
 *   6. onConfirm / onCancel wire to the right buttons.
 *   7. open={false} hides the dialog from the DOM.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ConfirmDialog } from "../ConfirmDialog";

afterEach(() => cleanup());

const baseProps = {
  open: true,
  title: "Delete account?",
  onConfirm: () => {},
  onCancel: () => {},
};

describe("ConfirmDialog — visibility", () => {
  it("renders the dialog when open=true", () => {
    render(<ConfirmDialog {...baseProps} />);
    expect(screen.queryByText("Delete account?")).not.toBeNull();
  });

  it("does NOT render the dialog when open=false", () => {
    render(<ConfirmDialog {...baseProps} open={false} />);
    expect(screen.queryByText("Delete account?")).toBeNull();
  });
});

describe("ConfirmDialog — semantics", () => {
  it("uses role='alertdialog' (not 'dialog')", () => {
    /* alertdialog tells AT that a response is REQUIRED before the
       user can continue — matches the contract for confirmation
       prompts. */
    render(<ConfirmDialog {...baseProps} />);
    expect(screen.queryByRole("alertdialog")).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the title", () => {
    render(<ConfirmDialog {...baseProps} title="Are you sure?" />);
    expect(screen.queryByText("Are you sure?")).not.toBeNull();
  });

  it("renders the description when provided", () => {
    render(
      <ConfirmDialog
        {...baseProps}
        description="This cannot be undone."
      />,
    );
    expect(screen.queryByText("This cannot be undone.")).not.toBeNull();
  });
});

describe("ConfirmDialog — labels", () => {
  it("uses default labels 'Confirm' + 'Cancel'", () => {
    render(<ConfirmDialog {...baseProps} />);
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeNull();
  });

  it("accepts custom confirmLabel + cancelLabel", () => {
    render(
      <ConfirmDialog
        {...baseProps}
        confirmLabel="Delete"
        cancelLabel="Keep"
      />,
    );
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Keep" })).not.toBeNull();
    /* Defaults should be gone. */
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });
});

describe("ConfirmDialog — callbacks", () => {
  it("calls onConfirm when the confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when the cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...baseProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("ConfirmDialog — destructive variant", () => {
  it("applies destructive styling on the confirm button when destructive=true", () => {
    render(
      <ConfirmDialog
        {...baseProps}
        destructive
        confirmLabel="Delete"
      />,
    );
    const confirm = screen.getByRole("button", { name: "Delete" });
    expect(confirm.className).toContain("bg-destructive");
  });

  it("applies primary styling on the confirm button when destructive=false (default)", () => {
    render(<ConfirmDialog {...baseProps} confirmLabel="OK" />);
    const confirm = screen.getByRole("button", { name: "OK" });
    /* The primary variant uses the brand purple — different class
       set from destructive. */
    expect(confirm.className).not.toContain("bg-destructive");
  });
});
