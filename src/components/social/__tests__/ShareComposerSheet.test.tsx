/** Sharing is session-only unless the user explicitly remembers a choice. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from "@testing-library/react";

const h = vi.hoisted(() => ({
  /** AuthProvider's `updateShareDefaults`: the account is where a
   *  remembered choice is saved. */
  save: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
const restriction = vi.hoisted(() => ({ isRestricted: false, loading: false }));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => restriction,
}));
vi.mock("@/lib/socialApi", () => ({ postActivity: vi.fn() }));
vi.mock("@/lib/sessionDelete", () => ({ recordSharedActivity: vi.fn() }));
// The sheet reads the signed-in user for the verified-email gate; a
// verified account keeps the gate off so these cases test the composer.
vi.mock("@/lib/auth", () => ({
  useUid: () => "u1",
  useAuth: () => ({
    user: { uid: "u1", emailVerified: true, providerData: [] },
    updateShareDefaults: h.save,
  }),
}));
vi.mock("@/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => ({ isOnline: true }),
}));

import ShareComposerSheet from "../ShareComposerSheet";
import {
  compose,
  resolveCompose,
  type ActivityPreview,
} from "@/lib/shareComposer";
import {
  finishShareStart,
  savedShareDefault,
  type ShareDefaults,
} from "@/lib/shareDefaults";

const UID = "u1";

const WORKOUT: ActivityPreview = {
  type: "workout",
  title: "Push Day",
  meta: ["1h 12m", "12,840kg volume"],
};

/** Drives the one-off share's `compose()` call and lets the sheet react. */
function openSheet(uid = UID, preview = WORKOUT) {
  let promise!: Promise<unknown>;
  act(() => {
    promise = compose(uid, preview);
  });
  return promise;
}

function rememberBox(): HTMLInputElement {
  return screen.getByRole("checkbox") as HTMLInputElement;
}

/** The answers the sheet saved on the account, one call per save. */
function saved(): ShareDefaults[] {
  return h.save.mock.calls.map(
    (call) => (call as unknown[])[0] as ShareDefaults
  );
}

beforeEach(() => {
  localStorage.clear();
  h.save.mockClear();
});
afterEach(() => {
  act(() => resolveCompose(null));
  cleanup();
});

describe("ShareComposerSheet", () => {
  it("starts with a session-only choice and no audience default", () => {
    render(<ShareComposerSheet />);
    void openSheet();
    expect(rememberBox().checked).toBe(false);
    expect(screen.getByText(/Applies to this session only/)).toBeTruthy();
  });

  it("sharing once does not save a default for the next workout", async () => {
    render(<ShareComposerSheet />);
    const first = openSheet();
    fireEvent.click(
      screen.getByRole("button", { name: /share to followers/i })
    );
    await expect(first).resolves.toEqual({
      visibility: "followers",
      caption: "",
    });
    expect(saved()).toEqual([]);
    void openSheet();
    expect(rememberBox().checked).toBe(false);
  });

  it("declining once does not suppress the next sharing choice", async () => {
    render(<ShareComposerSheet />);
    const first = openSheet();
    fireEvent.click(
      screen.getByRole("button", { name: /don't share this one/i })
    );
    await expect(first).resolves.toBeNull();
    expect(saved()).toEqual([]);
    void openSheet();
    expect(rememberBox()).toBeTruthy();
  });

  it("remembers an audience on the account only after an explicit opt-in and choice", async () => {
    render(<ShareComposerSheet />);
    const first = openSheet();
    fireEvent.click(rememberBox());
    expect(
      screen.getByText(/apply automatically to future workouts/)
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /share to followers/i })
    );
    await first;
    // Workouts only; runs keep whatever they had.
    expect(saved()).toEqual([{ workout: "followers" }]);
    // The finish screen applies it: the next workout posts with no sheet.
    expect(
      finishShareStart(savedShareDefault(saved()[0], "workout"), false)
    ).toEqual({ kind: "post", visibility: "followers" });
  });

  it("allows an explicit never-share default", async () => {
    render(<ShareComposerSheet />);
    const first = openSheet();
    fireEvent.click(rememberBox());
    fireEvent.click(
      screen.getByRole("button", { name: /don't share future workouts/i })
    );
    await expect(first).resolves.toBeNull();
    expect(saved()).toEqual([{ workout: "never" }]);
    expect(
      finishShareStart(savedShareDefault(saved()[0], "workout"), false)
    ).toEqual({ kind: "hold", reason: "never" });
  });

  it("closing after ticking remember never saves a default", async () => {
    render(<ShareComposerSheet />);
    const first = openSheet();
    fireEvent.click(rememberBox());
    fireEvent.keyDown(document, { key: "Escape" });
    await expect(first).resolves.toBeNull();
    expect(saved()).toEqual([]);
    void openSheet();
    expect(rememberBox().checked).toBe(false);
  });

  it("saves run defaults independently after explicit opt-in", async () => {
    render(<ShareComposerSheet />);
    const first = openSheet(UID, {
      ...WORKOUT,
      type: "run",
      title: "Easy run",
    });
    expect(rememberBox().checked).toBe(false);
    fireEvent.click(rememberBox());
    expect(screen.getByText(/apply automatically to future runs/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /don't share future runs/i })
    );
    await expect(first).resolves.toBeNull();
    expect(saved()).toEqual([{ run: "never" }]);
  });

  it("allows the user to change their mind about remembering", async () => {
    render(<ShareComposerSheet />);
    const first = openSheet();
    fireEvent.click(rememberBox());
    fireEvent.click(rememberBox());
    fireEvent.click(screen.getByRole("button", { name: /make public/i }));
    await expect(first).resolves.toEqual({ visibility: "public", caption: "" });
    expect(saved()).toEqual([]);
  });

  it("saves a default only for the account that opened the sheet", async () => {
    // Opened for a session of another account than the one signed in now:
    // the post still resolves, but nothing is saved on the wrong account.
    render(<ShareComposerSheet />);
    const first = openSheet("someone-else");
    fireEvent.click(rememberBox());
    fireEvent.click(
      screen.getByRole("button", { name: /share to followers/i })
    );
    await expect(first).resolves.toEqual({
      visibility: "followers",
      caption: "",
    });
    expect(saved()).toEqual([]);
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

  it("passes the posted id back, so Undo can take the post back by id", async () => {
    const { enqueueShare, withdrawQueuedShare } =
      await import("@/lib/shareComposer");
    const { postActivity } = await import("@/lib/socialApi");
    vi.mocked(postActivity).mockResolvedValue("act-79");
    enqueueShare(UID, { type: "run" }, { kind: "run", id: "r-43" });

    render(<ShareComposerSheet />);
    await act(async () => {});

    await expect(
      withdrawQueuedShare(UID, { kind: "run", id: "r-43" })
    ).resolves.toEqual({ status: "posted", activityId: "act-79" });
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

describe("ShareComposerSheet — a restricted account (S4e)", () => {
  afterEach(() => {
    restriction.isRestricted = false;
  });

  it("holds both shares and says why; declining stays open", () => {
    restriction.isRestricted = true;
    render(<ShareComposerSheet />);
    void openSheet();
    expect(screen.getByText("Your account is restricted")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /share to followers/i })
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /make public/i })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /don't share this one/i })
    ).not.toBeDisabled();
  });
});
