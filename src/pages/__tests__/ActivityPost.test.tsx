/**
 * `/activity/:activityId` — the post a props or comment notice is about.
 *
 * Against the Firestore fake: a readable post is drawn with the viewer's
 * own props state and its comments under it on the page, a comment notice
 * puts the comment field in focus, and a post the rules refuse (deleted,
 * or no longer shared) opens the actor's profile when the tray named them,
 * and says the post is unavailable when not.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  render,
  screen,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ useUid: () => "viewer" }));
// `blocked` is both directions merged, as useBlockedUsers returns it.
const blocks = vi.hoisted(() => ({ blocked: new Set<string>() }));
vi.mock("@/hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({ ...blocks, ready: true }),
}));
// The card and the comments have their own suites; here each only says
// what it was given.
const thread = vi.hoisted(() => ({
  countChange: null as ((delta: number) => void) | null,
}));
vi.mock("@/components/social/ActivityCard", () => ({
  default: ({
    feedItem,
    openComments,
    allExercises,
    linkToPost = true,
    onComment,
    commentDelta = 0,
  }: {
    feedItem: {
      summary: string;
      liked?: boolean;
      activity?: { photos?: unknown[] };
    };
    openComments?: boolean;
    allExercises?: boolean;
    linkToPost?: boolean;
    onComment?: () => void;
    commentDelta?: number;
  }) => (
    <article data-testid="post">
      {feedItem.summary} · liked {String(!!feedItem.liked)} · comments{" "}
      {String(!!openComments)} · every exercise {String(!!allExercises)} · links
      to itself {String(linkToPost)} · comments added {commentDelta} · photos{" "}
      {feedItem.activity?.photos?.length ?? 0}
      <button type="button" onClick={onComment}>
        Comment
      </button>
    </article>
  ),
}));
vi.mock("@/components/social/ActivityPostComments", () => ({
  default: ({
    activityId,
    commentCount,
    focusKey,
    quickChips,
    onCountChange,
  }: {
    activityId: string;
    commentCount: number;
    focusKey: number;
    quickChips?: string[];
    onCountChange: (delta: number) => void;
  }) => {
    thread.countChange = onCountChange;
    return (
      <section data-testid="comments">
        {activityId} · {commentCount} comments · focus {focusKey} · chips{" "}
        {quickChips?.join(", ")}
      </section>
    );
  },
}));

// The photos sheet has its own suite; here it says what it was given and
// hands back one more photo.
vi.mock("@/components/social/PostPhotosSheet", () => ({
  default: ({
    open,
    activityId,
    photos,
    visibility,
    onPhotosChange,
  }: {
    open: boolean;
    activityId: string;
    photos: { id: string }[];
    visibility?: string;
    onPhotosChange: (photos: unknown[]) => void;
  }) =>
    open ? (
      <div role="dialog" aria-label="Photos">
        {activityId} · {photos.length} photos · {visibility}
        <button
          type="button"
          onClick={() =>
            onPhotosChange([
              ...photos,
              { id: "Added00001", url: "https://x/y.jpg", w: 10, h: 10 },
            ])
          }
        >
          Add one
        </button>
      </div>
    ) : null,
}));

import ActivityPost from "../ActivityPost";
import {
  failNextFirestore,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";

const POST = {
  authorId: "viewer",
  authorName: "Sam",
  type: "run",
  summary: "Easy 5 km",
  visibility: "public",
  createdAt: 1,
};

/** Opens `url` as the tray does, with the route state it hands over. */
function renderAt(url: string, state?: { fallbackUserId?: string }): void {
  const [pathname, search = ""] = url.split("?");
  render(
    <MemoryRouter
      initialEntries={[{ pathname, search: search && `?${search}`, state }]}
    >
      <Routes>
        <Route path="/activity/:activityId" element={<ActivityPost />} />
        <Route path="/user/:uid" element={<p>profile page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  resetFirestore();
  blocks.blocked = new Set();
});
afterEach(cleanup);

describe("the post a notice opens", () => {
  it("draws the post with the viewer's props on it", async () => {
    seedFirestore({
      "activities/a1": POST,
      "kudos/a1/users/viewer": { at: 1 },
    });
    renderAt("/activity/a1");
    expect(await screen.findByTestId("post")).toHaveTextContent(
      "Easy 5 km · liked true · comments false"
    );
  });

  it("lists every exercise, where a feed card's '+N more' leads", async () => {
    seedFirestore({ "activities/a1": POST });
    renderAt("/activity/a1");
    expect(await screen.findByTestId("post")).toHaveTextContent(
      "every exercise true"
    );
  });

  it("draws the card without links back to the page it is on", async () => {
    seedFirestore({ "activities/a1": POST });
    renderAt("/activity/a1");
    expect(await screen.findByTestId("post")).toHaveTextContent(
      "links to itself false"
    );
  });

  /* Mob2's Mobbin finding 9: the comments are on the page, under the
     post, not in the card's sheet. */
  it("shows the post's comments on the page, under it", async () => {
    seedFirestore({ "activities/a1": { ...POST, commentCount: 2 } });
    renderAt("/activity/a1");
    expect(await screen.findByTestId("comments")).toHaveTextContent(
      "a1 · 2 comments · focus 0 · chips Nice run, Great pace, Keep it up"
    );
    // The card opens no sheet of its own here.
    expect(screen.getByTestId("post")).toHaveTextContent(
      "liked false · comments false"
    );
  });

  it("a comment notice puts the comment field in focus", async () => {
    seedFirestore({ "activities/a1": POST });
    renderAt("/activity/a1?comments=1");
    expect(await screen.findByTestId("comments")).toHaveTextContent("focus 1");
  });

  it("the card's comment button goes to the field on the page", async () => {
    seedFirestore({ "activities/a1": POST });
    renderAt("/activity/a1");
    (await screen.findByRole("button", { name: "Comment" })).click();
    expect(await screen.findByTestId("comments")).toHaveTextContent("focus 1");
  });

  it("a comment added on the page moves both counts", async () => {
    seedFirestore({ "activities/a1": { ...POST, commentCount: 2 } });
    renderAt("/activity/a1");
    await screen.findByTestId("comments");
    act(() => thread.countChange?.(1));
    expect(screen.getByTestId("comments")).toHaveTextContent("3 comments");
    expect(screen.getByTestId("post")).toHaveTextContent("comments added 1");
  });

  it("a refused read opens the profile of whoever acted", async () => {
    // The rules refuse a deleted post rather than answer it as missing.
    seedFirestore({ "activities/a1": POST });
    failNextFirestore("getDoc", {
      path: "activities/a1",
      code: "permission-denied",
    });
    renderAt("/activity/a1", { fallbackUserId: "alex" });
    expect(await screen.findByText("profile page")).toBeInTheDocument();
    expect(unfiredFailures()).toEqual([]);
  });

  it("with no one to fall back to, says the post is unavailable", async () => {
    renderAt("/activity/gone");
    expect(
      await screen.findByText("This post isn't available")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("post")).toBeNull();
  });

  it("a failed read is not a missing post: it offers to try again", async () => {
    seedFirestore({ "activities/a1": POST });
    failNextFirestore("getDoc", {
      path: "activities/a1",
      code: "unavailable",
    });
    renderAt("/activity/a1", { fallbackUserId: "alex" });
    expect(
      await screen.findByText("Couldn't load this post")
    ).toBeInTheDocument();
    expect(screen.queryByText("profile page")).toBeNull();
    screen.getByRole("button", { name: /try again/i }).click();
    expect(await screen.findByTestId("post")).toBeInTheDocument();
  });

  it("someone else's post from a person who blocked the viewer is not drawn", async () => {
    seedFirestore({ "activities/a1": { ...POST, authorId: "blocker" } });
    blocks.blocked = new Set(["blocker"]);
    renderAt("/activity/a1");
    expect(
      await screen.findByText("This post isn't available")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("post")).toBeNull();
  });
});

describe("photos on your own post (Soc15 call 2)", () => {
  const PHOTO = {
    id: "Photo00001",
    url: "https://firebasestorage.googleapis.com/v0/b/b/o/post-photos%2Fviewer%2Fa1%2FPhoto00001.jpg",
    w: 1600,
    h: 1200,
  };
  let online: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  });
  afterEach(() => online.mockRestore());

  it("offers Add photos on your own post, and the sheet's photos reach the card at once", async () => {
    seedFirestore({ "activities/a1": POST });
    renderAt("/activity/a1");
    await screen.findByTestId("post");
    fireEvent.click(screen.getByRole("button", { name: "Add photos" }));
    const sheet = await screen.findByRole("dialog", { name: "Photos" });
    expect(sheet).toHaveTextContent("a1 · 0 photos · public");
    fireEvent.click(screen.getByRole("button", { name: "Add one" }));
    expect(screen.getByTestId("post")).toHaveTextContent("photos 1");
    expect(screen.getByRole("button", { name: "Edit photos" })).toBeEnabled();
  });

  it("says Edit photos on a post that has some, and hands the sheet its list", async () => {
    seedFirestore({ "activities/a1": { ...POST, photos: [PHOTO] } });
    renderAt("/activity/a1");
    fireEvent.click(await screen.findByRole("button", { name: "Edit photos" }));
    expect(
      await screen.findByRole("dialog", { name: "Photos" })
    ).toHaveTextContent("a1 · 1 photos · public");
  });

  it("offers nothing on someone else's post", async () => {
    seedFirestore({ "activities/a1": { ...POST, authorId: "maya" } });
    renderAt("/activity/a1");
    await screen.findByTestId("post");
    expect(screen.queryByRole("button", { name: "Add photos" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit photos" })).toBeNull();
  });

  it("offline, the button is off and says why", async () => {
    online.mockReturnValue(false);
    seedFirestore({ "activities/a1": POST });
    renderAt("/activity/a1");
    await screen.findByTestId("post");
    expect(screen.getByRole("button", { name: "Add photos" })).toBeDisabled();
    expect(screen.getByText("Photos need a connection.")).toBeInTheDocument();
  });
});
