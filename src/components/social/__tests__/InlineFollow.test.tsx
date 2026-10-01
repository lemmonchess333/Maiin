/**
 * InlineFollow — Follow beside a post's author (2026-10-01).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

const H = vi.hoisted(() => ({
  read: null as null | ((v: boolean) => void),
  follow: vi.fn(async (_viewer: string, _target: string) => {}),
  track: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useUid: () => "me" }));
vi.mock("@/lib/socialApi", () => ({
  isFollowing: () =>
    new Promise<boolean>((resolve) => {
      H.read = resolve;
    }),
  followUser: (viewer: string, target: string) => H.follow(viewer, target),
  unfollowUser: vi.fn(),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: H.toastError } }));
vi.mock("@/lib/socialAnalytics", () => ({ track: H.track }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

import InlineFollow from "../InlineFollow";
import { __resetFollowStatesForTests } from "@/hooks/useFollowState";

beforeEach(() => {
  __resetFollowStatesForTests();
  H.read = null;
  H.follow = vi.fn(async (_viewer: string, _target: string) => {});
  H.track.mockClear();
  H.toastError.mockClear();
});
afterEach(cleanup);

async function answer(following: boolean) {
  await act(async () => H.read?.(following));
}

describe("InlineFollow", () => {
  it("waits for the answer instead of flashing Follow", async () => {
    render(<InlineFollow targetUid="maya" targetName="Maya" />);
    expect(screen.queryByRole("button")).toBeNull();
    await answer(false);
    expect(
      screen.getByRole("button", { name: "Follow Maya" })
    ).toBeInTheDocument();
  });

  it("shows nothing for someone already followed", async () => {
    render(<InlineFollow targetUid="maya" targetName="Maya" />);
    await answer(true);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("Following")).toBeNull();
  });

  it("following says so and stays, with no unfollow from a post", async () => {
    render(<InlineFollow targetUid="maya" targetName="Maya" />);
    await answer(false);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Follow Maya" }));
    });
    expect(H.follow).toHaveBeenCalledWith("me", "maya");
    expect(screen.getByText("Following")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(H.track).toHaveBeenCalledWith("social_follow", {
      followSource: "post",
    });
  });

  it("a failed follow comes back as Follow, and says it failed", async () => {
    H.follow = vi.fn(async (_viewer: string, _target: string) => {
      throw new Error("offline");
    });
    render(<InlineFollow targetUid="maya" targetName="Maya" />);
    await answer(false);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Follow Maya" }));
    });
    expect(
      screen.getByRole("button", { name: "Follow Maya" })
    ).toBeInTheDocument();
    expect(H.toastError).toHaveBeenCalledWith("Couldn't follow. Try again.");
    expect(H.track).not.toHaveBeenCalled();
  });
});
