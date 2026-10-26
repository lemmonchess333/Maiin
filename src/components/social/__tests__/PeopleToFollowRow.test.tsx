/**
 * PeopleToFollowRow — suggestions inside the feed (2026-10-01).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { SuggestedPerson } from "@/lib/socialApi";

const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/socialAnalytics", () => ({ track }));
vi.mock("@/components/social/BlockAwareAvatar", () => ({
  default: () => null,
}));
vi.mock("@/components/social/FollowButton", () => ({
  default: ({
    onFollowChange,
  }: {
    onFollowChange?: (following: boolean) => void;
  }) => (
    <button type="button" onClick={() => onFollowChange?.(true)}>
      Follow
    </button>
  ),
}));

import PeopleToFollowRow from "../PeopleToFollowRow";
import { suggestionReason } from "../suggestionReason";

afterEach(cleanup);

const PEOPLE: SuggestedPerson[] = [
  {
    uid: "priya",
    displayName: "Priya Shah",
    reason: "shared_space",
    sharedSpaceId: "womens-running",
  },
  { uid: "tom", displayName: "Tom Okafor", reason: "recent_post" },
];

function renderRow(people = PEOPLE) {
  const onFollowed = vi.fn();
  const onSeeAll = vi.fn();
  render(
    <MemoryRouter>
      <PeopleToFollowRow
        people={people}
        onFollowed={onFollowed}
        onSeeAll={onSeeAll}
      />
    </MemoryRouter>
  );
  return { onFollowed, onSeeAll };
}

describe("PeopleToFollowRow", () => {
  it("says why a person is suggested when there is a reason, as People search does", () => {
    renderRow();
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("Priya Shah")).toBeInTheDocument();
    expect(
      within(rows[0]).getByText("Also in Women's Running")
    ).toBeInTheDocument();
    expect(within(rows[0]).getByRole("link")).toHaveAttribute(
      "href",
      "/user/priya"
    );
    // A recent poster has no reason to give, so their card has no line
    // under the name: the link holds the avatar and the name alone.
    const tom = within(rows[1]).getByRole("link");
    expect(within(tom).getByText("Tom Okafor")).toBeInTheDocument();
    expect(tom.textContent).toBe("Tom Okafor");
    expect(within(rows[1]).queryByText("Recent post")).toBeNull();
  });

  it("a follow takes the person out of the row and is counted", () => {
    const { onFollowed } = renderRow();
    fireEvent.click(
      within(screen.getAllByRole("listitem")[1]).getByRole("button", {
        name: "Follow",
      })
    );
    expect(onFollowed).toHaveBeenCalledWith("tom");
    expect(track).toHaveBeenCalledWith("social_follow", {
      followSource: "people_row",
    });
  });

  it("See all opens People", () => {
    const { onSeeAll } = renderRow();
    fireEvent.click(screen.getByRole("button", { name: "See all" }));
    expect(onSeeAll).toHaveBeenCalled();
  });

  it("renders nothing with nobody to suggest", () => {
    renderRow([]);
    expect(screen.queryByText("People to follow")).toBeNull();
  });

  it("names the space, or says it is one you joined", () => {
    expect(
      suggestionReason({
        uid: "x",
        displayName: "X",
        reason: "shared_space",
        sharedSpaceId: "no-such-space",
      })
    ).toBe("Also in a space you joined");
  });

  it("gives no reason for a recent poster, or a shared space it cannot name", () => {
    expect(
      suggestionReason({ uid: "x", displayName: "X", reason: "recent_post" })
    ).toBeNull();
    // A shared-space suggestion with no space id has no space to name.
    expect(
      suggestionReason({ uid: "x", displayName: "X", reason: "shared_space" })
    ).toBeNull();
  });
});
