/**
 * ShareDefaultsRow — the only place a share default can be CHOSEN.
 *
 * The share composer short-circuits `compose()` once a default is saved, so
 * this preference decides whether the app asks at all. It used to be
 * writable in one direction only: the post-session sheet could set it, this
 * row could only clear it, and the row rendered nothing at all until a
 * default existed. So a user who wanted "never share my workouts" had to
 * finish a workout to say so, and there was no setting to find in the
 * meantime.
 *
 * The tests are about what the user can reach:
 *   - the control EXISTS before any default does (a row that hides itself
 *     until the sheet has run is not a setting), and
 *   - each choice writes the value `compose()` actually reads. Asserting
 *     the selected segment alone would pass against a component that only
 *     updated its own state.
 *
 * Per-type independence matters because the defaults are stored per type —
 * changing runs must leave workouts alone.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from "@testing-library/react";
import ShareDefaultsRow from "../ShareDefaultsRow";
import { setShareDefault, getShareDefault } from "@/lib/shareComposer";

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const UID = "u1";

/** The segmented control for one share type. Scoping by its radiogroup
 *  keeps "the runs control" and "the workouts control" distinguishable —
 *  both render the same four option labels. */
function group(noun: string) {
  return screen.getByRole("radiogroup", {
    name: new RegExp(`default sharing for ${noun}`, "i"),
  });
}

function pick(noun: string, option: string) {
  fireEvent.click(
    within(group(noun)).getByRole("radio", {
      name: new RegExp(`^${option}$`, "i"),
    })
  );
}

function selected(noun: string): string | null {
  const checked = within(group(noun))
    .getAllByRole("radio")
    .find((el) => el.getAttribute("aria-checked") === "true");
  return checked?.textContent ?? null;
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(cleanup);

describe("ShareDefaultsRow", () => {
  it("offers the control BEFORE any default exists", () => {
    // The whole point of the row. Pre-2026-08-04 it returned null here, so
    // the setting could only be found after the post-session sheet had run.
    render(<ShareDefaultsRow uid={UID} />);

    expect(screen.getByText("Runs")).toBeTruthy();
    expect(screen.getByText("Workouts")).toBeTruthy();
    expect(selected("runs")).toBe("Ask");
    expect(selected("workouts")).toBe("Ask");
  });

  it("renders nothing when signed out", () => {
    setShareDefault(UID, "run", "public");
    const { container } = render(<ShareDefaultsRow uid={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["public", "Shared publicly automatically"],
    ["followers", "Shared with your followers automatically"],
    ["never", "Never shared"],
  ] as const)("reflects and describes a stored %s default", (pref, copy) => {
    setShareDefault(UID, "workout", pref);
    render(<ShareDefaultsRow uid={UID} />);

    expect(selected("workouts")).toBe(
      pref === "never" ? "Never" : pref === "public" ? "Public" : "Followers"
    );
    // "Public" as a segment label doesn't say public WHAT, or when.
    expect(screen.getByText(copy)).toBeTruthy();
  });

  it.each([
    ["Never", "never"],
    ["Public", "public"],
    ["Followers", "followers"],
  ] as const)("WRITES %s as the value compose() reads", (label, stored) => {
    render(<ShareDefaultsRow uid={UID} />);

    pick("workouts", label);

    expect(getShareDefault(UID, "workout")).toBe(stored);
  });

  it("CLEARS the stored preference when Ask is picked", () => {
    // "Ask" is the absence of a default, not a fourth stored value —
    // `compose()` only short-circuits on a stored preference, so storing
    // "ask" would silence the sheet forever.
    setShareDefault(UID, "run", "public");
    render(<ShareDefaultsRow uid={UID} />);

    pick("runs", "Ask");

    expect(getShareDefault(UID, "run")).toBeNull();
    expect(selected("runs")).toBe("Ask");
  });

  it("changes ONE type without touching the other", () => {
    setShareDefault(UID, "run", "public");
    setShareDefault(UID, "workout", "never");
    render(<ShareDefaultsRow uid={UID} />);

    pick("runs", "Ask");

    expect(getShareDefault(UID, "run")).toBeNull();
    expect(getShareDefault(UID, "workout")).toBe("never");
    expect(selected("workouts")).toBe("Never");
  });

  it("reads the preference for THIS uid only", () => {
    // Shared-device uid scoping (audit F9): another account's saved
    // default must not surface here.
    setShareDefault("someone-else", "run", "public");
    render(<ShareDefaultsRow uid={UID} />);
    expect(selected("runs")).toBe("Ask");
  });
});
