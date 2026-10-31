/**
 * Blocking hides each person from the other (S4, Polish3 call 1), on every
 * social surface.
 *
 * The person blocked learns of a block from the server's copy,
 * `blockedBy/{them}/users/{blocker}` (functions/lib/blockMirror.js), which
 * `useBlockedUsers` merges with the account's own blocks into the one set
 * every surface filters on. The first half here drives surfaces through the
 * REAL hook against the Firestore fake (ADR-0009), seeding only that copy:
 * the tray, the unread badge and the photos on every list. The second half
 * holds every other filtering surface to the merged set, because each one
 * reads it the same way and a surface that read `youBlocked` instead would
 * hide only one direction.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  renderHook,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const viewer = vi.hoisted(() => ({ uid: "viewer" }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: viewer.uid } }),
  useUid: () => viewer.uid,
}));
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));

import { Timestamp } from "firebase/firestore";
import { useNotifications } from "../useNotifications";
import { useUnreadCount } from "../useUnreadCount";
import BlockAwareAvatar from "@/components/social/BlockAwareAvatar";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";

const hoursAgo = (h: number) =>
  Timestamp.fromDate(new Date(Date.now() - h * 3600_000));

/** A viewer of each test's own: the block lists are cached per uid. */
let n = 0;
function newViewer(): string {
  viewer.uid = `both-ways-${++n}`;
  // The blocker blocked the viewer: only the server's copy says so.
  seedFirestore({ [`blockedBy/${viewer.uid}/users/blocker`]: {} });
  return viewer.uid;
}

beforeEach(() => {
  resetFirestore();
  window.localStorage.clear();
});
afterEach(cleanup);

describe("what the person blocked no longer sees of the blocker", () => {
  it("the tray drops the blocker's notifications", async () => {
    const me = newViewer();
    seedFirestore({
      [`notifications/${me}/items/from-blocker`]: {
        type: "kudos",
        fromUserId: "blocker",
        fromName: "Blocker",
        createdAt: hoursAgo(1),
      },
      [`notifications/${me}/items/from-friend`]: {
        type: "kudos",
        fromUserId: "friend",
        fromName: "Friend",
        createdAt: hoursAgo(2),
      },
    });
    const { result } = renderHook(() => useNotifications());
    // POSITIVE anchor: the friend's row is there.
    await waitFor(() =>
      expect(result.current.items.map((i) => i.fromUserId)).toContain("friend")
    );
    await waitFor(() =>
      expect(result.current.items.map((i) => i.fromUserId)).toEqual(["friend"])
    );
  });

  it("the unread badge does not count the blocker's posts", async () => {
    const me = newViewer();
    const item = (authorId: string) => ({
      schemaVersion: 2,
      authorId,
      activityId: `${authorId}-post`,
      createdAt: hoursAgo(1),
    });
    seedFirestore({
      [`feeds/${me}/items/a`]: item("blocker"),
      [`feeds/${me}/items/b`]: item("friend"),
      [`feeds/${me}/items/c`]: item("another"),
    });
    const { result } = renderHook(() => useUnreadCount());
    await waitFor(() => expect(result.current.count).toBeGreaterThan(0));
    await waitFor(() => expect(result.current.count).toBe(2));
  });

  it("lists show the blocker without their photo", async () => {
    newViewer();
    render(
      <>
        <BlockAwareAvatar
          uid="friend"
          photoURL="https://lh3.googleusercontent.com/friend.jpg"
          displayName="Friend"
        />
        <BlockAwareAvatar
          uid="blocker"
          photoURL="https://lh3.googleusercontent.com/blocker.jpg"
          displayName="Blocker"
        />
      </>
    );
    await waitFor(() =>
      expect(
        screen.queryAllByRole("img").map((img) => img.getAttribute("src"))
      ).toEqual(["https://lh3.googleusercontent.com/friend.jpg"])
    );
  });
});

/* Every surface that leaves people out reads the merged `blocked`. The
   tray, badge and photos are driven above; these are pinned by their
   own suites against `blocked` (CommentSheet, ActivityPostComments,
   SpaceCommentSheet, Space, FollowList,
   SpacePost, Social, PeopleView, ActivityCard, useFriendsBoard,
   useChallenges),
   so what is left to hold is that each one reads the merged set. */
const ROOT = resolve(__dirname, "../../..");
const FILTERING_SURFACES: Record<string, string> = {
  "src/pages/Social.tsx": "the feed, Explore, search and suggestions",
  "src/pages/Space.tsx": "a Space's posts",
  "src/pages/FollowList.tsx": "your followers and following",
  // The feed sheet's and the post page's comments both read through it.
  "src/hooks/useActivityComments.ts": "comments on a post",
  "src/features/spaces/SpaceCommentSheet.tsx": "comments on a Space post",
  "src/components/social/ActivityCard.tsx": "the props list",
  "src/components/social/BlockAwareAvatar.tsx": "photos on every list",
  "src/hooks/useNotifications.ts": "the notification tray",
  "src/pages/ActivityPost.tsx": "a post a notice opens",
  "src/pages/SpacePost.tsx": "a Space post a notice opens",
  "src/hooks/useUnreadCount.ts": "the unread badge",
  "src/hooks/useFriendsBoard.ts": "the friends board",
  "src/features/challenges/useChallenges.ts": "challenge leaderboards",
};
const READS_MERGED = /const \{[^}]*\bblocked\b[^}]*\} = useBlockedUsers\(\);/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === "__tests__" ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("every filtering surface reads both directions", () => {
  it.each(Object.entries(FILTERING_SURFACES))(
    "%s (%s) filters on the merged set",
    (file) => {
      expect(readFileSync(join(ROOT, file), "utf8")).toMatch(READS_MERGED);
    }
  );

  it("only the profile reads one direction alone, for Unblock and not available", () => {
    const oneWay = sourceFiles(join(ROOT, "src"))
      .filter((path) =>
        /\b(youBlocked|blockedYou)\b/.test(readFileSync(path, "utf8"))
      )
      .map((path) => relative(ROOT, path))
      .sort();
    expect(oneWay).toEqual([
      "src/hooks/useBlockedUsers.ts",
      "src/pages/UserProfile.tsx",
    ]);
  });
});
