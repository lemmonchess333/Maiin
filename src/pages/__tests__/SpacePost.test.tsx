/**
 * `/space/:spaceId/post/:postId` — the Space post a props or comment notice
 * is about.
 *
 * Against the Firestore fake: a readable post is drawn with the viewer's
 * own props on it (the real likes hook, reading `likes/{viewer}`), a
 * comment notice opens its comments, and a post that cannot be shown
 * (gone, refused, across a block, a retired coach post, or in a Space the
 * app does not have) opens the Space when the tray asked, and says it is
 * unavailable when not. A failed read is not a missing post.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "viewer" },
    profile: { displayName: "Sam", uid: "viewer" },
  }),
  useUid: () => "viewer",
}));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => ({ isRestricted: false, loading: false }),
}));
// `blocked` is both directions merged, as useBlockedUsers returns it.
const blocks = vi.hoisted(() => ({ blocked: new Set<string>() }));
vi.mock("@/hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({ ...blocks, ready: true, addBlocked: vi.fn() }),
}));
// The card and the comment sheet have their own suites; here they only say
// what they were given, and offer the two ways out the page answers.
vi.mock("@/features/spaces/SpacePostCard", () => ({
  default: ({
    post,
    liked,
    onOpenComments,
    onRemoved,
    postId,
  }: {
    post: { body: string };
    liked?: boolean;
    onOpenComments?: () => void;
    onRemoved: (postId: string) => void;
    postId: string;
  }) => (
    <article data-testid="space-post">
      {post.body} · liked {String(!!liked)}
      <button type="button" onClick={onOpenComments}>
        Comments
      </button>
      <button type="button" onClick={() => onRemoved(postId)}>
        Delete post
      </button>
    </article>
  ),
}));
vi.mock("@/features/spaces/SpaceCommentSheet", () => ({
  default: ({
    spaceId,
    postId,
    commentCount,
    onOpenChange,
  }: {
    spaceId: string;
    postId: string;
    commentCount: number;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div data-testid="comments">
      {spaceId}/{postId} · {commentCount} comments
      <button type="button" onClick={() => onOpenChange(false)}>
        Close comments
      </button>
    </div>
  ),
}));

import SpacePost from "../SpacePost";
import {
  failNextFirestore,
  readLog,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";

const SPACE = "womens-running";
const POST_PATH = `spaces/${SPACE}/posts/p1`;
const POST = {
  authorId: "viewer",
  authorName: "Sam",
  body: "First 10K done this morning.",
  likeCount: 3,
  commentCount: 1,
  createdAt: 1,
};

/** Opens `url` as the tray does, with the route state it hands over. */
function renderAt(url: string, state?: { fallbackToSpace?: boolean }): void {
  const [pathname, search = ""] = url.split("?");
  render(
    <MemoryRouter
      initialEntries={[{ pathname, search: search && `?${search}`, state }]}
    >
      <Routes>
        <Route path="/space/:spaceId/post/:postId" element={<SpacePost />} />
        <Route path="/space/:spaceId" element={<p>space page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const FROM_TRAY = { fallbackToSpace: true };

beforeEach(() => {
  resetFirestore();
  blocks.blocked = new Set();
});
afterEach(cleanup);

describe("the Space post a notice opens", () => {
  it("draws the post with the viewer's props on it, under its Space", async () => {
    seedFirestore({
      [POST_PATH]: POST,
      [`${POST_PATH}/likes/viewer`]: { createdAt: 1 },
    });
    renderAt(`/space/${SPACE}/post/p1`, FROM_TRAY);
    // The props are read once the post is drawn, as on the Space page.
    expect(await screen.findByText(/liked true/)).toHaveTextContent(
      "First 10K done this morning. · liked true"
    );
    expect(
      screen.getByRole("link", { name: "Women's Running" })
    ).toHaveAttribute("href", `/space/${SPACE}`);
    expect(screen.queryByTestId("comments")).toBeNull();
  });

  it("a comment notice opens the post's comments, with its count", async () => {
    seedFirestore({ [POST_PATH]: POST });
    renderAt(`/space/${SPACE}/post/p1?comments=1`, FROM_TRAY);
    expect(await screen.findByTestId("comments")).toHaveTextContent(
      `${SPACE}/p1 · 1 comments`
    );
    fireEvent.click(screen.getByRole("button", { name: "Close comments" }));
    expect(screen.queryByTestId("comments")).toBeNull();
  });

  it("the card's comments open the sheet on a props notice", async () => {
    seedFirestore({ [POST_PATH]: POST });
    renderAt(`/space/${SPACE}/post/p1`);
    fireEvent.click(await screen.findByRole("button", { name: "Comments" }));
    expect(await screen.findByTestId("comments")).toBeInTheDocument();
  });

  it("a refused read opens the Space when the tray asked", async () => {
    seedFirestore({ [POST_PATH]: POST });
    failNextFirestore("getDoc", { path: POST_PATH, code: "permission-denied" });
    renderAt(`/space/${SPACE}/post/p1`, FROM_TRAY);
    expect(await screen.findByText("space page")).toBeInTheDocument();
    expect(unfiredFailures()).toEqual([]);
  });

  it("a deleted post, reached without the tray, says so and offers the Space", async () => {
    renderAt(`/space/${SPACE}/post/gone`);
    expect(
      await screen.findByText("This post isn't available")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open Women's Running" })
    ).toHaveAttribute("href", `/space/${SPACE}`);
    expect(screen.queryByTestId("space-post")).toBeNull();
  });

  it("a failed read is not a missing post: it offers to try again", async () => {
    seedFirestore({ [POST_PATH]: POST });
    failNextFirestore("getDoc", { path: POST_PATH, code: "unavailable" });
    renderAt(`/space/${SPACE}/post/p1`, FROM_TRAY);
    expect(
      await screen.findByText("Couldn't load this post")
    ).toBeInTheDocument();
    expect(unfiredFailures()).toEqual([]);
    expect(screen.queryByText("space page")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByTestId("space-post")).toBeInTheDocument();
  });

  it("someone else's post across a block is not drawn, either way", async () => {
    seedFirestore({ [POST_PATH]: { ...POST, authorId: "blocker" } });
    blocks.blocked = new Set(["blocker"]);
    renderAt(`/space/${SPACE}/post/p1`);
    expect(
      await screen.findByText("This post isn't available")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("space-post")).toBeNull();
  });

  it("from the tray, a post across a block opens the Space instead", async () => {
    seedFirestore({ [POST_PATH]: { ...POST, authorId: "blocker" } });
    blocks.blocked = new Set(["blocker"]);
    renderAt(`/space/${SPACE}/post/p1`, FROM_TRAY);
    expect(await screen.findByText("space page")).toBeInTheDocument();
  });

  it("a retired coach post stays hidden, as it does in the Space", async () => {
    seedFirestore({
      [POST_PATH]: { ...POST, authorId: "tropos-coach", official: true },
    });
    renderAt(`/space/${SPACE}/post/p1`);
    expect(
      await screen.findByText("This post isn't available")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("space-post")).toBeNull();
  });

  it("a post in a Space the app does not have is not read", async () => {
    seedFirestore({ "spaces/merged-away/posts/p1": POST });
    renderAt("/space/merged-away/post/p1");
    expect(
      await screen.findByText("This post isn't available")
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Open / })).toBeNull();
    expect(
      readLog().filter((r) => r.path.startsWith("spaces/merged-away"))
    ).toEqual([]);
  });

  it("the author deleting it goes back to the Space it was in", async () => {
    seedFirestore({ [POST_PATH]: POST });
    renderAt(`/space/${SPACE}/post/p1`);
    fireEvent.click(await screen.findByRole("button", { name: "Delete post" }));
    expect(await screen.findByText("space page")).toBeInTheDocument();
  });
});
