/** Sharing is session-only unless the user explicitly remembers a choice. */
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
  resolveCompose,
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
afterEach(() => {
  act(() => resolveCompose(null, false));
  cleanup();
});

describe("ShareComposerSheet", () => {
  it("starts with a session-only choice and no audience default", () => {
    render(<ShareComposerSheet />);
    void openSheet();
    expect(rememberBox().checked).toBe(false);
    expect(getShareDefault(UID, "workout")).toBeNull();
    expect(screen.getByText(/Applies to this session only/)).toBeTruthy();
  });

  it("sharing once does not automatically share the next workout", async () => {
    render(<ShareComposerSheet />);
    const first = openSheet();
    fireEvent.click(
      screen.getByRole("button", { name: /share to followers/i })
    );
    await expect(first).resolves.toEqual({
      visibility: "followers",
      caption: "",
    });
    expect(getShareDefault(UID, "workout")).toBeNull();
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
    expect(getShareDefault(UID, "workout")).toBeNull();
    void openSheet();
    expect(rememberBox()).toBeTruthy();
  });

  it("remembers an audience only after an explicit opt-in and choice", async () => {
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
    expect(getShareDefault(UID, "workout")).toBe("followers");
    await expect(openSheet()).resolves.toEqual({
      visibility: "followers",
      caption: "",
    });
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(getShareDefault(UID, "run")).toBeNull();
  });

  it("allows an explicit never-share default", async () => {
    render(<ShareComposerSheet />);
    const first = openSheet();
    fireEvent.click(rememberBox());
    fireEvent.click(
      screen.getByRole("button", { name: /don't share future workouts/i })
    );
    await expect(first).resolves.toBeNull();
    expect(getShareDefault(UID, "workout")).toBe("never");
    await expect(openSheet()).resolves.toBeNull();
  });

  it("closing after ticking remember never saves a default", async () => {
    render(<ShareComposerSheet />);
    const first = openSheet();
    fireEvent.click(rememberBox());
    fireEvent.keyDown(document, { key: "Escape" });
    await expect(first).resolves.toBeNull();
    expect(getShareDefault(UID, "workout")).toBeNull();
    void openSheet();
    expect(rememberBox().checked).toBe(false);
  });

  it("saves run defaults independently after explicit opt-in", async () => {
    render(<ShareComposerSheet />);
    let first!: Promise<unknown>;
    act(() => {
      first = compose(UID, { ...WORKOUT, type: "run", title: "Easy run" });
    });
    expect(rememberBox().checked).toBe(false);
    fireEvent.click(rememberBox());
    expect(screen.getByText(/apply automatically to future runs/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /don't share future runs/i })
    );
    await expect(first).resolves.toBeNull();
    expect(getShareDefault(UID, "run")).toBe("never");
    expect(getShareDefault(UID, "workout")).toBeNull();
  });

  it("allows the user to change their mind about remembering", async () => {
    render(<ShareComposerSheet />);
    const first = openSheet();
    fireEvent.click(rememberBox());
    fireEvent.click(rememberBox());
    fireEvent.click(screen.getByRole("button", { name: /make public/i }));
    await expect(first).resolves.toEqual({ visibility: "public", caption: "" });
    expect(getShareDefault(UID, "workout")).toBeNull();
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
