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

const h = vi.hoisted(() => ({
  user: {
    uid: "u1",
    emailVerified: true,
    providerData: [{ providerId: "password" }],
  } as Record<string, unknown>,
  withdraw: vi.fn(),
}));

vi.mock("firebase/firestore");
vi.mock("@/lib/socialApi", () => ({
  postActivity: vi.fn(async () => "act-strict"),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/sessionPost", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sessionPost")>()),
  withdrawSessionPost: (...args: unknown[]) => h.withdraw(...args),
}));

import SessionShareRow from "../SessionShareRow";
import { getShareDefault, setShareDefault } from "@/lib/shareComposer";
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

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  h.withdraw.mockReset();
  h.user = {
    uid: "u1",
    emailVerified: true,
    providerData: [{ providerId: "password" }],
  };
});
afterEach(cleanup);

describe("no saved answer: ask once", () => {
  it("asks, and the answer posts this session with no sheet and is kept for runs and workouts", async () => {
    const a = action("workout");
    render(<SessionShareRow action={a} />);
    expect(
      screen.getByRole("heading", { name: "Share sessions automatically?" })
    ).toBeInTheDocument();
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
    expect(getShareDefault("u1", "workout")).toBe("followers");
    expect(getShareDefault("u1", "run")).toBe("followers");
    expect(
      screen.queryByRole("heading", { name: "Share sessions automatically?" })
    ).toBeNull();
  });

  it("the three answers are equal: same control, none filled", () => {
    render(<SessionShareRow action={action("run")} />);
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
    expect(
      screen.getByRole("region", { name: "Share sessions automatically?" })
    ).toHaveClass("bg-card");
  });

  it('"Don\'t share" posts nothing, is kept, and leaves the one-off share', async () => {
    const a = action("run");
    render(<SessionShareRow action={a} />);
    fireEvent.click(screen.getByRole("button", { name: "Don't share" }));
    expect(
      await screen.findByRole("button", { name: "Share this session" })
    ).toBeInTheDocument();
    expect(a.post).not.toHaveBeenCalled();
    expect(getShareDefault("u1", "run")).toBe("never");
  });

  it("only claims, and only sets, the types without an answer", () => {
    setShareDefault("u1", "run", "never");
    render(<SessionShareRow action={action("workout")} />);
    expect(
      screen.getByText(/Applies to every workout from now on/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Share publicly" }));
    expect(getShareDefault("u1", "run")).toBe("never");
    expect(getShareDefault("u1", "workout")).toBe("public");
  });
});

describe("a saved answer", () => {
  it("posts on arrival with no tap, and says where it went", async () => {
    setShareDefault("u1", "run", "public");
    const a = action("run");
    render(<SessionShareRow action={a} />);
    await screen.findByText("Shared publicly");
    expect(a.post).toHaveBeenCalledWith({ visibility: "public", caption: "" });
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("posts once under StrictMode", async () => {
    // StrictMode runs the posting effect twice. The real action is what
    // makes the second run wait on the first post instead of making one.
    setShareDefault("u1", "workout", "followers");
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
    setShareDefault("u1", "workout", "never");
    const a = action("workout");
    render(<SessionShareRow action={a} />);
    expect(a.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Share this session" }));
    await screen.findByText("Shared with your followers");
    // No decision: the action opens the sheet.
    expect(a.post).toHaveBeenCalledWith();
  });

  it("is never acted on for an account that must verify its email first", () => {
    h.user = {
      uid: "u1",
      emailVerified: false,
      providerData: [{ providerId: "password" }],
    };
    setShareDefault("u1", "run", "followers");
    const a = action("run");
    render(<SessionShareRow action={a} />);
    expect(a.post).not.toHaveBeenCalled();
    expect(
      screen.getByText("Verify your email to share sessions.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Share this session" })
    ).toBeInTheDocument();
  });

  it("a failed post says so and offers the button", async () => {
    setShareDefault("u1", "run", "followers");
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
});

describe("Undo", () => {
  it("takes a post back and says so", async () => {
    setShareDefault("u1", "workout", "followers");
    const a = action("workout");
    render(<SessionShareRow action={a} />);
    await screen.findByText("Shared with your followers");
    h.withdraw.mockResolvedValue(undefined);
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
    setShareDefault("u1", "run", "followers");
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
    h.withdraw.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Undo sharing" }));
    await screen.findByText("It won't be shared.");
  });

  it("keeps showing the post when Undo fails", async () => {
    setShareDefault("u1", "workout", "public");
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
    setShareDefault("u1", "run", "followers");
    render(<SessionShareRow action={action("run")} />);
    const status = screen.getByRole("status");
    await waitFor(() =>
      expect(status).toHaveTextContent("Shared with your followers")
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});
