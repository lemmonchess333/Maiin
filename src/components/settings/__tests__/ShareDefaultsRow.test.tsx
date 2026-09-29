/**
 * ShareDefaultsRow — the only place a share default can be CHOSEN.
 *
 * The finish screen reads this preference (SessionShareRow): a saved
 * audience posts every session automatically, "Never" posts nothing, and
 * no default asks the one question. So it decides whether the app asks at
 * all. It used to be
 * writable in one direction only: the post-session sheet could set it, this
 * row could only clear it, and the row rendered nothing at all until a
 * default existed. So a user who wanted "never share my workouts" had to
 * finish a workout to say so, and there was no setting to find in the
 * meantime.
 *
 * The tests are about what the user can reach:
 *   - the control EXISTS before any default does (a row that hides itself
 *     until the sheet has run is not a setting), and
 *   - each choice saves the value the finish screen actually reads
 *     (`savedShareDefault`, through `finishShareStart`). Asserting
 *     the selected segment alone would pass against a component that only
 *     updated its own state.
 *
 * The answers live on the account, so the row renders what it is given and
 * saves through `updateShareDefaults`; the harness below stands in for
 * AuthProvider, which changes the profile the moment it is called. That the
 * save lands on `users/{uid}` and another device acts on it is pinned
 * against the real AuthProvider in `shareDefaultsAccount.test.tsx`.
 *
 * Per-type independence matters because the defaults are stored per type —
 * changing runs must leave workouts alone.
 */
import { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from "@testing-library/react";
import ShareDefaultsRow from "../ShareDefaultsRow";
import {
  finishShareStart,
  savedShareDefault,
  type ShareDefaults,
} from "@/lib/shareDefaults";

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const UID = "u1";

/** Every save the row made, in order. */
let saves: ShareDefaults[] = [];

/** The row wired the way SettingsPrivacy wires it: the profile's answers
 *  in, a save that changes them at once. */
function Harness({
  uid = UID,
  initial,
}: {
  uid?: string | null;
  initial?: ShareDefaults;
}) {
  const [answers, setAnswers] = useState<ShareDefaults | undefined>(initial);
  return (
    <ShareDefaultsRow
      uid={uid}
      shareDefaults={answers}
      updateShareDefaults={async (next) => {
        saves.push(next);
        setAnswers((prev) => ({ ...prev, ...next }));
        return { ok: true };
      }}
    />
  );
}

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
  saves = [];
});
afterEach(cleanup);

describe("ShareDefaultsRow", () => {
  it("offers the control BEFORE any default exists", () => {
    // The whole point of the row. Pre-2026-08-04 it returned null here, so
    // the setting could only be found after the post-session sheet had run.
    render(<Harness />);

    expect(screen.getByText("Runs")).toBeTruthy();
    expect(screen.getByText("Workouts")).toBeTruthy();
    expect(selected("runs")).toBe("Ask");
    expect(selected("workouts")).toBe("Ask");
  });

  it("renders nothing when signed out", () => {
    const { container } = render(
      <Harness uid={null} initial={{ run: "public" }} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["public", "Shared publicly automatically"],
    ["followers", "Shared with your followers automatically"],
    ["never", "Never shared"],
  ] as const)("reflects and describes a saved %s default", (pref, copy) => {
    render(<Harness initial={{ workout: pref }} />);

    expect(selected("workouts")).toBe(
      pref === "never" ? "Never" : pref === "public" ? "Public" : "Followers"
    );
    // "Public" as a segment label doesn't say public WHAT, or when.
    expect(screen.getByText(copy)).toBeTruthy();
  });

  it("shows a cleared answer as Ask", () => {
    render(<Harness initial={{ run: null, workout: "never" }} />);
    expect(selected("runs")).toBe("Ask");
    expect(selected("workouts")).toBe("Never");
  });

  it.each([
    ["Never", "never"],
    ["Public", "public"],
    ["Followers", "followers"],
  ] as const)(
    "SAVES %s as the value the finish screen reads",
    (label, stored) => {
      render(<Harness />);

      pick("workouts", label);

      expect(saves).toEqual([{ workout: stored }]);
      expect(selected("workouts")).toBe(label);
      expect(
        finishShareStart(savedShareDefault(saves[0], "workout"), false).kind
      ).toBe(stored === "never" ? "hold" : "post");
    }
  );

  it("CLEARS the answer when Ask is picked", () => {
    // "Ask" is the absence of a default, not a fourth stored value — the
    // finish screen asks only when there is none, so saving "ask" would
    // silence the question forever.
    render(<Harness initial={{ run: "public" }} />);

    pick("runs", "Ask");

    expect(saves).toEqual([{ run: null }]);
    expect(finishShareStart(savedShareDefault(saves[0], "run"), false)).toEqual(
      { kind: "ask" }
    );
    expect(selected("runs")).toBe("Ask");
  });

  it("changes ONE type without touching the other", () => {
    render(<Harness initial={{ run: "public", workout: "never" }} />);

    pick("runs", "Ask");

    // One key per save: the account's other answer is not rewritten.
    expect(saves).toEqual([{ run: null }]);
    expect(selected("workouts")).toBe("Never");
  });
});
