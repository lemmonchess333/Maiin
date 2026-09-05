/**
 * ShareComposerSheet — the sheet is meant to appear ONCE.
 *
 * `compose()` short-circuits as soon as a default is stored, so the sheet
 * was always designed to stop asking. But the "remember this" tick defaulted
 * OFF, and nothing else could write the preference, so a user who never
 * spotted the checkbox got the same prompt after every single session. That
 * is the operator's "it duplicates it, and it's not needed" report: not a
 * duplicated flow, a default that never stuck.
 *
 * The end-to-end property is what these tests pin — answer once, and the
 * SECOND `compose()` resolves without opening. Asserting the checkbox's
 * `checked` attribute alone would pass against a sheet whose tick was
 * decorative.
 *
 * The visibility itself is NOT pre-selected, deliberately: publishing
 * training data without an explicit choice is the one outcome worth
 * avoiding outright. Only the remembering is defaulted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from "@testing-library/react";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/socialApi", () => ({ postActivity: vi.fn() }));
vi.mock("@/lib/sessionDelete", () => ({ recordSharedActivity: vi.fn() }));
// The sheet reads the signed-in user for the verified-email gate; a
// verified account keeps the gate off so these cases test the composer.
vi.mock("@/lib/auth", () => ({
  useUid: () => "u1",
  useAuth: () => ({
    user: { uid: "u1", emailVerified: true, providerData: [] },
  }),
}));
vi.mock("@/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => ({ isOnline: true }),
}));

import ShareComposerSheet from "../ShareComposerSheet";
import {
  compose,
  getShareDefault,
  type ActivityPreview,
} from "@/lib/shareComposer";

const UID = "u1";

const WORKOUT: ActivityPreview = {
  type: "workout",
  title: "Push Day",
  meta: ["1h 12m", "12,840kg volume"],
};

/** Drives a save chain's `compose()` call and lets the sheet react. */
function openSheet() {
  let promise!: Promise<unknown>;
  act(() => {
    promise = compose(UID, WORKOUT);
  });
  return promise;
}

function rememberBox(): HTMLInputElement {
  return screen.getByRole("checkbox") as HTMLInputElement;
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(cleanup);

describe("ShareComposerSheet", () => {
  it("pre-ticks 'remember' so the sheet asks once, not every session", () => {
    render(<ShareComposerSheet />);
    void openSheet();

    expect(rememberBox().checked).toBe(true);
    expect(screen.getByText(/make this my default for workouts/i)).toBeTruthy();
  });

  it("does NOT pre-select a visibility — only the remembering", () => {
    // Remembering a choice the user made is safe; making one for them
    // publishes training data they never agreed to publish.
    render(<ShareComposerSheet />);
    void openSheet();

    expect(getShareDefault(UID, "workout")).toBeNull();
  });

  it("stops opening after the user answers once", async () => {
    render(<ShareComposerSheet />);
    const first = openSheet();

    fireEvent.click(
      screen.getByRole("button", { name: /share to followers/i })
    );
    await expect(first).resolves.toEqual({
      visibility: "followers",
      caption: "",
    });
    expect(getShareDefault(UID, "workout")).toBe("followers");

    // The second session must resolve from the stored default, with no sheet.
    await expect(openSheet()).resolves.toEqual({
      visibility: "followers",
      caption: "",
    });
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("remembers 'don't share' too — declining is a default like any other", async () => {
    render(<ShareComposerSheet />);
    const first = openSheet();

    fireEvent.click(
      screen.getByRole("button", { name: /don't share this one/i })
    );
    await expect(first).resolves.toBeNull();
    expect(getShareDefault(UID, "workout")).toBe("never");

    await expect(openSheet()).resolves.toBeNull();
  });

  it("respects the user un-ticking it — that session stays a one-off", async () => {
    // The pre-tick is a default, not a decision taken away from them.
    render(<ShareComposerSheet />);
    const first = openSheet();

    fireEvent.click(rememberBox());
    expect(rememberBox().checked).toBe(false);
    fireEvent.click(
      screen.getByRole("button", { name: /share to followers/i })
    );
    await first;

    expect(getShareDefault(UID, "workout")).toBeNull();

    // …so it opens again next time.
    void openSheet();
    expect(rememberBox()).toBeTruthy();
  });

  it("tells the user where to change it", () => {
    // A remembered choice with no visible way back is a one-way door; the
    // hint names the screen that owns the reversal (ShareDefaultsRow).
    render(<ShareComposerSheet />);
    void openSheet();

    expect(screen.getByText(/settings/i)).toBeTruthy();
  });
});

/**
 * The drain's marker write. Queued items carry the session they are
 * ABOUT; after the drain posts one, it must record the activity id back
 * onto that session — the link `deleteLoggedSession` uses to clear the
 * post. Without this, a share made offline was permanently less
 * deletable than the identical share made online.
 */
describe("drain records the share link", () => {
  beforeEach(async () => {
    // This suite has no global mock reset; these two are shared across
    // its tests, so scrub them here rather than inheriting call counts.
    const { postActivity } = await import("@/lib/socialApi");
    const { recordSharedActivity } = await import("@/lib/sessionDelete");
    vi.mocked(postActivity).mockClear();
    vi.mocked(recordSharedActivity).mockClear();
  });

  it("writes the marker for a sourced item, with the posted id", async () => {
    const { enqueueShare } = await import("@/lib/shareComposer");
    const { postActivity } = await import("@/lib/socialApi");
    const { recordSharedActivity } = await import("@/lib/sessionDelete");
    vi.mocked(postActivity).mockResolvedValue("act-77");
    enqueueShare(
      UID,
      { type: "run", runName: "Easy 5k" },
      {
        kind: "run",
        id: "r-42",
      }
    );

    render(<ShareComposerSheet />);
    await act(async () => {});

    expect(postActivity).toHaveBeenCalledTimes(1);
    expect(recordSharedActivity).toHaveBeenCalledWith(
      UID,
      { kind: "run", id: "r-42" },
      "act-77"
    );
  });

  it("posts a legacy source-less item without attempting a marker", async () => {
    const { enqueueShare } = await import("@/lib/shareComposer");
    const { postActivity } = await import("@/lib/socialApi");
    const { recordSharedActivity } = await import("@/lib/sessionDelete");
    vi.mocked(postActivity).mockResolvedValue("act-78");
    enqueueShare(UID, { type: "workout" });

    render(<ShareComposerSheet />);
    await act(async () => {});

    expect(postActivity).toHaveBeenCalledTimes(1);
    expect(recordSharedActivity).not.toHaveBeenCalled();
  });
});
