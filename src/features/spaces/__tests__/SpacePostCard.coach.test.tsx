/**
 * SpacePostCard — Coach variant (SOC-P2b).
 *
 * The weekly coach prompt (server-written, authorId "tropos-coach")
 * must read as the APP's voice, never a person: brand-marked tile
 * instead of an initials avatar, a purple "Coach" badge instead of the
 * green Tropos Team badge, and a "Share your take" reply affordance
 * that opens the composer prefilled — rendered only where posting is
 * possible (onShareTake passed). Ordinary official posts keep the
 * Tropos Team badge (regression pin).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "viewer-1" } }),
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

import SpacePostCard from "../SpacePostCard";
import { COACH_AUTHOR_ID } from "../spaceTypes";
import type { SpacePostDoc } from "../spaceTypes";

function makePost(overrides: Partial<SpacePostDoc> = {}): SpacePostDoc {
  return {
    authorId: COACH_AUTHOR_ID,
    authorName: "Tropos Coach",
    title: "What's your week one win?",
    body: "New week, clean slate.",
    official: true,
    likeCount: 0,
    commentCount: 0,
    createdAt: { toDate: () => new Date() } as SpacePostDoc["createdAt"],
    ...overrides,
  };
}

function renderCard(post: SpacePostDoc, onShareTake?: (t: string) => void) {
  return render(
    <SpacePostCard
      spaceId="runners"
      postId="coach-2026-07-20"
      post={post}
      accent="#D4637A"
      onRemoved={() => {}}
      onShareTake={onShareTake}
    />
  );
}

describe("SpacePostCard — coach variant", () => {
  it("shows the purple Coach badge, not Tropos Team", () => {
    renderCard(makePost());
    expect(screen.getByText("Coach")).toBeInTheDocument();
    expect(screen.queryByText("Tropos Team")).toBeNull();
  });

  it("ordinary official posts keep the Tropos Team badge", () => {
    renderCard(
      makePost({ authorId: "some-real-uid-28-chars-long1", authorName: "Ops" })
    );
    expect(screen.getByText("Tropos Team")).toBeInTheDocument();
    expect(screen.queryByText("Coach")).toBeNull();
  });

  it("offers Share your take when posting is possible, passing the prompt title", () => {
    const onShareTake = vi.fn();
    renderCard(makePost(), onShareTake);
    fireEvent.click(screen.getByRole("button", { name: /share your take/i }));
    expect(onShareTake).toHaveBeenCalledWith("What's your week one win?");
  });

  it("renders no reply affordance when onShareTake is absent (non-member)", () => {
    renderCard(makePost(), undefined);
    expect(
      screen.queryByRole("button", { name: /share your take/i })
    ).toBeNull();
  });

  it("never offers Share your take on a human post", () => {
    const onShareTake = vi.fn();
    renderCard(
      makePost({ authorId: "some-real-uid-28-chars-long1", official: false }),
      onShareTake
    );
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
