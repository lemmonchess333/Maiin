/**
 * SpacePostCard — the author badge and the like toggle.
 *
 * The weekly coach posts are retired and pages drop them before they
 * reach this card (`isMemberFacing`), so the card has no coach variant.
 * The last block pins that filter, and pins the retired author id to the
 * value the server still checks: the old posts are in Firestore under
 * it, and a drifted id on either side would show them again or notify a
 * user who does not exist.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "viewer-1" } }),
  useUid: () => ({ user: { uid: "viewer-1" } }).user?.uid ?? null,
}));
vi.mock("@/hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({ blocked: new Set(), addBlocked: vi.fn() }),
}));
vi.mock("@/lib/socialApi", () => ({ blockUser: vi.fn() }));
vi.mock("@/components/social/RouteScene", () => ({ default: () => null }));
vi.mock("@/components/social/MiniMuscleFigure", () => ({
  default: () => null,
  hasMuscleFigure: () => false,
}));
vi.mock("@/components/social/ReportModal", () => ({ default: () => null }));

import { createRequire } from "node:module";
import SpacePostCard from "../SpacePostCard";
import { COACH_AUTHOR_ID, isMemberFacing } from "../spaceTypes";
import type { SpacePostDoc } from "../spaceTypes";

const require = createRequire(import.meta.url);
const server = require("../../../../functions/lib/spacePostEngagement.js") as {
  COACH_AUTHOR_ID: string;
};

function makePost(overrides: Partial<SpacePostDoc> = {}): SpacePostDoc {
  return {
    authorId: "member-uid-28-chars-long-abcd",
    authorName: "Priya S.",
    body: "First 10K done this morning.",
    likeCount: 0,
    commentCount: 0,
    createdAt: { toDate: () => new Date() } as SpacePostDoc["createdAt"],
    ...overrides,
  };
}

function renderCard(post: SpacePostDoc) {
  return render(
    <SpacePostCard
      spaceId="runners"
      postId="p1"
      post={post}
      accent="#D4637A"
      onRemoved={() => {}}
    />
  );
}

describe("SpacePostCard — author badge", () => {
  it("marks an official post as Tropos Team", () => {
    renderCard(makePost({ official: true, authorName: "Ops" }));
    expect(screen.getByText("Tropos Team")).toBeInTheDocument();
  });

  it("says Pinned on the time line, leaving the name row to the name", () => {
    renderCard(
      makePost({ official: true, pinned: true, authorName: "Tropos Team" })
    );
    const line = screen.getByText(/ · Pinned$/);
    expect(line.textContent).not.toContain("Tropos Team");
    expect(screen.getByText("Tropos Team", { selector: "span" })).toBeVisible();
  });

  it("shows a member's post with no badge and no reply prompt", () => {
    renderCard(makePost());
    expect(screen.getByText("Priya S.")).toBeInTheDocument();
    expect(screen.queryByText("Tropos Team")).toBeNull();
    expect(screen.queryByText("Coach")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /share your take/i })
    ).toBeNull();
  });
});

describe("SpacePostCard — like toggle (SOC-P2c)", () => {
  it("renders an interactive flame when onToggleLike is provided", () => {
    const onToggleLike = vi.fn();
    render(
      <SpacePostCard
        spaceId="runners"
        postId="p1"
        post={makePost({ likeCount: 2 })}
        accent="#D4637A"
        onRemoved={() => {}}
        onToggleLike={onToggleLike}
      />
    );
    const btn = screen.getByRole("button", { name: /give props/i });
    fireEvent.click(btn);
    expect(onToggleLike).toHaveBeenCalledTimes(1);
  });

  it("shows the stored count plus the optimistic delta", () => {
    render(
      <SpacePostCard
        spaceId="runners"
        postId="p1"
        post={makePost({ likeCount: 2 })}
        accent="#D4637A"
        onRemoved={() => {}}
        liked
        likeDelta={1}
        onToggleLike={() => {}}
      />
    );
    const btn = screen.getByRole("button", { name: /remove props/i });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(btn.textContent).toContain("3");
  });

  it("stays read-only without onToggleLike (no button, count still shows)", () => {
    render(
      <SpacePostCard
        spaceId="runners"
        postId="p1"
        post={makePost({ likeCount: 4 })}
        accent="#D4637A"
        onRemoved={() => {}}
      />
    );
    expect(screen.queryByRole("button", { name: /give props/i })).toBeNull();
    expect(screen.getByText("4")).toBeInTheDocument();
  });
});

describe("retired coach posts", () => {
  it("drops the coach's posts and keeps members' and the team's", () => {
    expect(isMemberFacing(makePost({ authorId: COACH_AUTHOR_ID }))).toBe(false);
    expect(isMemberFacing(makePost())).toBe(true);
    expect(
      isMemberFacing(makePost({ authorId: "ops-uid", official: true }))
    ).toBe(true);
  });

  it("uses the author id the old posts were written with, on both sides", () => {
    expect(COACH_AUTHOR_ID).toBe("tropos-coach");
    expect(server.COACH_AUTHOR_ID).toBe(COACH_AUTHOR_ID);
  });
});
