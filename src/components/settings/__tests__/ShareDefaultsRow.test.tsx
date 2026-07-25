/**
 * ShareDefaultsRow — the way back out of "Always do this".
 *
 * The share composer short-circuits `compose()` once a default is saved, so
 * without this row the choice is a ONE-WAY DOOR: pick "never" and the
 * prompt never returns; pick "public" and every session auto-posts. That
 * failure is invisible — the app keeps working, it just stops asking — so
 * the tests here are about what the user can still reach:
 *
 *   - a saved default is NAMED (a row that showed "Runs" with no verdict
 *     wouldn't tell the user what they'd chosen), and
 *   - resetting it actually clears the stored preference, which is the
 *     thing `compose()` reads. Asserting the button disappears would pass
 *     against a row that only updated its own state.
 *
 * Per-type independence matters because the defaults are stored per type —
 * clearing runs must leave workouts alone.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import ShareDefaultsRow from "../ShareDefaultsRow";
import { __setShareDefault, getShareDefault } from "@/lib/shareComposer";

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const UID = "u1";

beforeEach(() => {
  localStorage.clear();
});
afterEach(cleanup);

describe("ShareDefaultsRow", () => {
  it("renders NOTHING when no default has been saved", () => {
    // There is no "off" state to explain — only a choice to undo.
    const { container } = render(<ShareDefaultsRow uid={UID} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when signed out", () => {
    __setShareDefault(UID, "run", "public");
    const { container } = render(<ShareDefaultsRow uid={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names what the saved default actually does", () => {
    // "Runs" alone wouldn't tell the user which choice they're undoing.
    __setShareDefault(UID, "run", "never");
    render(<ShareDefaultsRow uid={UID} />);

    expect(screen.getByText("Runs")).toBeTruthy();
    expect(screen.getByText("Never shared")).toBeTruthy();
  });

  it.each([
    ["public", "Always shared publicly"],
    ["followers", "Always shared with followers"],
    ["never", "Never shared"],
  ] as const)("describes a %s default", (pref, copy) => {
    __setShareDefault(UID, "workout", pref);
    render(<ShareDefaultsRow uid={UID} />);
    expect(screen.getByText(copy)).toBeTruthy();
  });

  it("only lists types that HAVE a saved default", () => {
    __setShareDefault(UID, "run", "public");
    render(<ShareDefaultsRow uid={UID} />);

    expect(screen.getByText("Runs")).toBeTruthy();
    expect(screen.queryByText("Workouts")).toBeNull();
  });

  it("CLEARS the stored preference — the value compose() reads", () => {
    // Asserting only that the row disappears would pass against a
    // component that updated its own state and wrote nothing.
    __setShareDefault(UID, "run", "public");
    render(<ShareDefaultsRow uid={UID} />);

    fireEvent.click(screen.getByRole("button", { name: /ask again/i }));

    expect(getShareDefault(UID, "run")).toBeNull();
    expect(screen.queryByText("Runs")).toBeNull();
  });

  it("clears ONE type without touching the other", () => {
    __setShareDefault(UID, "run", "public");
    __setShareDefault(UID, "workout", "never");
    render(<ShareDefaultsRow uid={UID} />);

    const buttons = screen.getAllByRole("button", { name: /ask again/i });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]); // runs is listed first

    expect(getShareDefault(UID, "run")).toBeNull();
    expect(getShareDefault(UID, "workout")).toBe("never");
    expect(screen.getByText("Workouts")).toBeTruthy();
  });

  it("reads the preference for THIS uid only", () => {
    // Shared-device uid scoping (audit F9): another account's saved
    // default must not surface here.
    __setShareDefault("someone-else", "run", "public");
    const { container } = render(<ShareDefaultsRow uid={UID} />);
    expect(container).toBeEmptyDOMElement();
  });
});
