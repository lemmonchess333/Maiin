/**
 * SessionShareRow — the finish screen's answer to "what happens to this
 * session's feed post". Owner decision 2026-09-23: ask once, then share
 * automatically (Strava's model without its public default).
 *
 * The properties held here are the ones a user would notice first if they
 * broke: the question is asked once and its answer is kept; a saved answer
 * posts with no tap and says so; "Don't share" and an unverified account
 * post nothing; the session is posted once under StrictMode; and every post
 * can be taken back from the screen that made it.
 *
 * The answer is the account's (`profile.shareDefaults`), so the row reads
 * it fresh (`refreshProfile`) before acting on it: another device may have
 * changed it while this one kept the app open. `useAuth` is stood in for
 * here; the same flow against the real AuthProvider and the Firestore fake
 * is `shareDefaultsAccount.test.tsx`.
 */
import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import type { ShareDefaults } from "@/lib/shareDefaults";

const h = vi.hoisted(() => ({
  user: {
    uid: "u1",
    emailVerified: true,
    providerData: [{ providerId: "password" }],
  } as Record<string, unknown>,
  /** The profile this device holds. */
  profile: { uid: "u1" } as { uid: string; shareDefaults?: ShareDefaults },
  /** The account's answers as the server holds them now, when another
   *  device has changed them since this one loaded the profile. */
  server: undefined as ShareDefaults | undefined,
  withdraw: vi.fn(),
  refresh: vi.fn(),
  save: vi.fn(),
}));

vi.mock("firebase/firestore");
vi.mock("@/lib/socialApi", () => ({
  postActivity: vi.fn(async () => "act-strict"),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: h.user,
    profile: h.profile,
    refreshProfile: h.refresh,
    updateShareDefaults: h.save,
  }),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const restriction = vi.hoisted(() => ({ isRestricted: false, loading: false }));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => restriction,
}));
vi.mock("@/lib/sessionPost", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sessionPost")>()),
  withdrawSessionPost: (...args: unknown[]) => h.withdraw(...args),
}));

import SessionShareRow from "../SessionShareRow";
import { postActivity } from "@/lib/socialApi";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";
import {
  createSessionShare,
  type SessionShareAction,
  type ShareOutcome,
} from "@/lib/sessionPost";

let n = 0;
function action(
  type: "run" | "workout",
  post: SessionShareAction["post"] = vi.fn(
    async (d): Promise<ShareOutcome> => ({
      status: "posted",
      visibility: d?.visibility ?? "followers",
      activityId: "act-1",
    })
  )
): SessionShareAction {
  return { uid: "u1", type, source: { kind: type, id: `s-${++n}` }, post };
}

/** The account's answers, as this device loaded them. */
function saved(answers: ShareDefaults) {
  h.profile = { uid: "u1", shareDefaults: answers };
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
}

const QUESTION = { name: "Share sessions automatically?" };

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  setOnline(true);
  restriction.isRestricted = false;
  restriction.loading = false;
  h.withdraw.mockReset();
  h.user = {
    uid: "u1",
    emailVerified: true,
    providerData: [{ providerId: "password" }],
  };
  h.profile = { uid: "u1" };
  h.server = undefined;
  // AuthProvider's refreshProfile: the server's answers replace the ones
  // this device held.
  h.refresh.mockReset().mockImplementation(async () => {
    if (h.server !== undefined) {
      h.profile = { ...h.profile, shareDefaults: h.server };
    }
  });
  // AuthProvider's updateShareDefaults: the profile changes at once.
  h.save.mockReset().mockImplementation(async (answers: ShareDefaults) => {
    h.profile = {
      ...h.profile,
      shareDefaults: { ...h.profile.shareDefaults, ...answers },
    };
    return { ok: true };
  });
});
afterEach(() => {
  cleanup();
  setOnline(true);
});

describe("no saved answer: ask once", () => {
  it("asks, and the answer posts this session with no sheet and is saved for runs and workouts", async () => {
    const a = action("workout");
    render(<SessionShareRow action={a} />);
    expect(await screen.findByRole("heading", QUESTION)).toBeInTheDocument();
    expect(a.post).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Share with followers" })
    );
    await screen.findByText("Shared with your followers");
    expect(a.post).toHaveBeenCalledTimes(1);
    expect(a.post).toHaveBeenCalledWith({
      visibility: "followers",
      caption: "",
    });
    // Saved on the account, for both types, in one save.
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.save).toHaveBeenCalledWith({
      run: "followers",
      workout: "followers",
    });
    expect(screen.queryByRole("heading", QUESTION)).toBeNull();
  });

  it("the three answers are equal: same control, none filled", async () => {
    render(<SessionShareRow action={action("run")} />);
    await screen.findByRole("heading", QUESTION);
    const answers = [
      "Share with followers",
      "Share publicly",
      "Don't share",
    ].map((name) => screen.getByRole("button", { name }));
    const classes = new Set(answers.map((b) => b.className));
    expect(classes.size).toBe(1);
    // Secondary buttons are filled with the muted tone. On a muted card
    // they had no edge at all, and read as three lines of text.
    expect(answers[0]).toHaveClass("bg-muted");
    expect(screen.getByRole("region", QUESTION)).toHaveClass("bg-card");
  });

  it('"Don\'t share" posts nothing, is saved, and leaves the one-off share', async () => {
    const a = action("run");
    render(<SessionShareRow action={a} />);
    fireEvent.click(await screen.findByRole("button", { name: "Don't share" }));
    expect(
      await screen.findByRole("button", { name: "Share this session" })
    ).toBeInTheDocument();
    expect(a.post).not.toHaveBeenCalled();
    expect(h.save).toHaveBeenCalledWith({ run: "never", workout: "never" });
  });

  it("only claims, and only saves, the types without an answer", async () => {
    saved({ run: "never" });
    render(<SessionShareRow action={action("workout")} />);
    expect(
      await screen.findByText(/Applies to every workout from now on/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Share publicly" }));
    expect(h.save).toHaveBeenCalledWith({ workout: "public" });
  });

  it("asks again for a type whose answer was cleared", async () => {
    saved({ run: null, workout: "never" });
    const a = action("run");
    render(<SessionShareRow action={a} />);
    expect(await screen.findByRole("heading", QUESTION)).toBeInTheDocument();
    expect(a.post).not.toHaveBeenCalled();
  });
});

describe("a saved answer", () => {
  it("posts on arrival with no tap, and says where it went", async () => {
    saved({ run: "public" });
    const a = action("run");
    render(<SessionShareRow action={a} />);
    await screen.findByText("Shared publicly");
    expect(a.post).toHaveBeenCalledWith({ visibility: "public", caption: "" });
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("posts once under StrictMode", async () => {
    // StrictMode runs the posting effect twice. The real action is what
    // makes the second run wait on the first post instead of making one.
    saved({ workout: "followers" });
    vi.mocked(postActivity).mockClear();
    const id = `strict-${++n}`;
    seedFirestore({ [`users/u1/workouts/${id}`]: { date: "x" } });
    const real = createSessionShare({
      uid: "u1",
      type: "workout",
      source: { kind: "workout", id },
      preview: () => ({ type: "workout", title: "Push", meta: [] }),
      payload: () => ({
        authorId: "u1",
        authorName: "Alex",
        type: "workout",
        visibility: "followers",
      }),
    });
    render(
      <StrictMode>
        <SessionShareRow action={real} />
      </StrictMode>
    );
    await screen.findByText("Shared with your followers");
    expect(postActivity).toHaveBeenCalledTimes(1);
  });

  it("'never' posts nothing and offers the one-off share, which opens the sheet", async () => {
    saved({ workout: "never" });
    const a = action("workout");
    render(<SessionShareRow action={a} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Share this session" })
    );
    await screen.findByText("Shared with your followers");
    // No decision: the action opens the sheet.
    expect(a.post).toHaveBeenCalledTimes(1);
    expect(a.post).toHaveBeenCalledWith();
  });

  it("is never acted on for an account that must verify its email first", async () => {
    h.user = {
      uid: "u1",
      emailVerified: false,
      providerData: [{ providerId: "password" }],
    };
    saved({ run: "followers" });
    const a = action("run");
    render(<SessionShareRow action={a} />);
    expect(
      await screen.findByText("Verify your email to share sessions.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Share this session" })
    ).toBeInTheDocument();
    expect(a.post).not.toHaveBeenCalled();
  });

  it("a failed post says so and offers the button", async () => {
    saved({ run: "followers" });
    const a = action(
      "run",
      vi.fn(async () => {
        throw new Error("permission-denied");
      })
    );
    render(<SessionShareRow action={a} />);
    await screen.findByText("Couldn't share this session.");
    expect(
      screen.getByRole("button", { name: "Share this session" })
    ).toBeInTheDocument();
  });

  it("holds a session of another account than the one signed in", async () => {
    // The profile is someone else's: its answers are not this session's,
    // and nothing may be saved on it for this session either.
    h.profile = { uid: "u2", shareDefaults: { run: "public" } };
    const a = action("run");
    render(<SessionShareRow action={a} />);
    expect(
      await screen.findByRole("button", { name: "Share this session" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", QUESTION)).toBeNull();
    expect(a.post).not.toHaveBeenCalled();
  });
});

describe("the account's answer, read before acting on it", () => {
  it("does not post on an answer another device has since turned off", async () => {
    // This device loaded "public"; the account now says "never".
    saved({ run: "public" });
    h.server = { run: "never" };
    const a = action("run");
    render(<SessionShareRow action={a} />);
    expect(
      await screen.findByRole("button", { name: "Share this session" })
    ).toBeInTheDocument();
    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(a.post).not.toHaveBeenCalled();
  });

  it("acts on an answer given on another device without asking again", async () => {
    h.server = { workout: "followers" };
    const a = action("workout");
    render(<SessionShareRow action={a} />);
    await screen.findByText("Shared with your followers");
    expect(a.post).toHaveBeenCalledWith({
      visibility: "followers",
      caption: "",
    });
    expect(screen.queryByRole("heading", QUESTION)).toBeNull();
  });

  it("shows nothing until it has read the answer", async () => {
    saved({ run: "public" });
    let answer!: () => void;
    h.refresh.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          answer = resolve;
        })
    );
    const a = action("run");
    const { container } = render(<SessionShareRow action={a} />);
    await waitFor(() => expect(h.refresh).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(a.post).not.toHaveBeenCalled();
    answer();
    await screen.findByText("Shared publicly");
  });

  it("acts on the answer this device holds when it cannot read the account's", async () => {
    saved({ run: "never" });
    h.refresh.mockRejectedValue(new Error("unavailable"));
    const a = action("run");
    render(<SessionShareRow action={a} />);
    expect(
      await screen.findByRole("button", { name: "Share this session" })
    ).toBeInTheDocument();
    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(a.post).not.toHaveBeenCalled();
  });

  it("offline, acts on the answer this device holds without reading", async () => {
    setOnline(false);
    saved({ workout: "followers" });
    const a = action(
      "workout",
      vi.fn(
        async (): Promise<ShareOutcome> => ({
          status: "queued",
          visibility: "followers",
        })
      )
    );
    render(<SessionShareRow action={a} />);
    await screen.findByText(
      "Will share with your followers when you're back online"
    );
    expect(h.refresh).not.toHaveBeenCalled();
  });
});

describe("Undo", () => {
  it("takes a post back and says so", async () => {
    saved({ workout: "followers" });
    const a = action("workout");
    render(<SessionShareRow action={a} />);
    await screen.findByText("Shared with your followers");
    h.withdraw.mockResolvedValue("removed");
    fireEvent.click(screen.getByRole("button", { name: "Undo sharing" }));
    await screen.findByText("Removed from the feed.");
    expect(h.withdraw).toHaveBeenCalledWith(a, {
      status: "posted",
      visibility: "followers",
      activityId: "act-1",
    });
    expect(
      screen.getByRole("button", { name: "Share this session" })
    ).toBeInTheDocument();
  });

  it("an offline post says it will share on reconnect, and Undo stops it", async () => {
    saved({ run: "followers" });
    const a = action(
      "run",
      vi.fn(
        async (): Promise<ShareOutcome> => ({
          status: "queued",
          visibility: "followers",
        })
      )
    );
    render(<SessionShareRow action={a} />);
    await screen.findByText(
      "Will share with your followers when you're back online"
    );
    h.withdraw.mockResolvedValue("cancelled");
    fireEvent.click(screen.getByRole("button", { name: "Undo sharing" }));
    await screen.findByText("It won't be shared.");
  });

  it("an offline post that went out before Undo says it was removed, not that it won't be shared", async () => {
    saved({ run: "followers" });
    const a = action(
      "run",
      vi.fn(
        async (): Promise<ShareOutcome> => ({
          status: "queued",
          visibility: "followers",
        })
      )
    );
    render(<SessionShareRow action={a} />);
    await screen.findByText(
      "Will share with your followers when you're back online"
    );
    // Back online, the queue posted it before the tap; Undo deleted it.
    h.withdraw.mockResolvedValue("removed");
    fireEvent.click(screen.getByRole("button", { name: "Undo sharing" }));
    await screen.findByText("Removed from the feed.");
    expect(screen.queryByText("It won't be shared.")).toBeNull();
  });

  it("keeps showing the post when Undo fails", async () => {
    saved({ workout: "public" });
    render(<SessionShareRow action={action("workout")} />);
    await screen.findByText("Shared publicly");
    h.withdraw.mockRejectedValue(new Error("unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Undo sharing" }));
    await waitFor(() => expect(h.withdraw).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Undo sharing" })
      ).not.toBeDisabled()
    );
    expect(screen.getByText("Shared publicly")).toBeInTheDocument();
  });
});

describe("screen readers", () => {
  it("announce what happened through one status region that stays mounted", async () => {
    saved({ run: "followers" });
    render(<SessionShareRow action={action("run")} />);
    const status = await screen.findByRole("status");
    await waitFor(() =>
      expect(status).toHaveTextContent("Shared with your followers")
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

describe("a restricted account (S4e)", () => {
  it("shares nothing automatically, and says why in the row's place", async () => {
    saved({ run: "followers", workout: "followers" });
    restriction.isRestricted = true;
    const a = action("workout");
    render(<SessionShareRow action={a} />);
    expect(
      await screen.findByText("Your account is restricted")
    ).toBeInTheDocument();
    expect(a.post).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", QUESTION)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Share this session" })
    ).toBeNull();
  });

  it("posts nothing while the restriction is still being read", async () => {
    saved({ run: "public", workout: "public" });
    restriction.loading = true;
    const a = action("run");
    const { container } = render(<SessionShareRow action={a} />);
    await waitFor(() => expect(h.refresh).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(a.post).not.toHaveBeenCalled();
  });
});
