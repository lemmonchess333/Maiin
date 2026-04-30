import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/* The badge is tiny — its only logic is "render if followers has me,
 * else null" — so the test surface is small but worth pinning so a
 * future refactor of useFollowersOfMe doesn't accidentally drop the
 * conditional and start showing the chip on every row. */

const followers = { value: new Set<string>() };
vi.mock("../../../hooks/useFollowersOfMe", () => ({
  useFollowersOfMe: () => ({
    followers: followers.value,
    addFollower: () => {},
    removeFollower: () => {},
  }),
}));

import FollowsYouBadge from "../FollowsYouBadge";

describe("FollowsYouBadge", () => {
  it("renders 'Follows you' when the uid is in the current user's followers", () => {
    followers.value = new Set(["alice"]);
    render(<FollowsYouBadge uid="alice" />);
    expect(screen.getByText("Follows you")).toBeTruthy();
  });

  it("renders nothing when the uid is not in followers", () => {
    followers.value = new Set(["bob"]);
    const { container } = render(<FollowsYouBadge uid="alice" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when followers set is empty", () => {
    followers.value = new Set();
    const { container } = render(<FollowsYouBadge uid="alice" />);
    expect(container.firstChild).toBeNull();
  });

  it("uses an aria-label so screen readers know what the badge means", () => {
    followers.value = new Set(["alice"]);
    render(<FollowsYouBadge uid="alice" />);
    expect(screen.getByLabelText("This athlete follows you")).toBeTruthy();
  });
});
