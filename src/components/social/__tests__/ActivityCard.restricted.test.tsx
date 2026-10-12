/**
 * Props on a feed card for a restricted account (S4e). Props reach the
 * post's author, so a restricted account cannot give them: the flame says
 * why instead of lighting. A restriction that lands after the feed loaded
 * is first heard of in the server's refusal, which says the same thing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { FeedItem } from "../../../hooks/useSocialFeed";

const H = vi.hoisted(() => ({
  giveHighFive: vi.fn(),
  toastError: vi.fn(),
  restriction: { isRestricted: false, loading: false },
}));
vi.mock("../../../lib/auth", () => ({
  useAuth: () => ({ user: { uid: "viewer" }, profile: null }),
}));
vi.mock("../../../lib/socialApi", () => ({
  giveHighFive: (...args: unknown[]) => H.giveHighFive(...args),
  getKudosList: vi.fn(async () => []),
  blockUser: vi.fn(),
}));
vi.mock("../../../hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => H.restriction,
}));
vi.mock("../../../hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({ addBlocked: vi.fn(), blockedUsers: new Set() }),
}));
vi.mock("../../../hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km",
}));
vi.mock("../../../lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: H.toastError } }));
vi.mock("../Avatar", () => ({ default: () => <div /> }));
vi.mock("../BlockAwareAvatar", () => ({ default: () => <div /> }));

import ActivityCard from "../ActivityCard";
import { RESTRICTED_TOAST } from "@/lib/accountRestriction";

const ITEM = {
  id: "a1",
  activityId: "a1",
  authorId: "author",
  authorName: "Test Author",
  type: "run",
  summary: "Easy run",
  createdAt: { toDate: () => new Date("2026-08-21T10:00:00Z") },
  kudosCount: 2,
  activity: { authorId: "author", authorName: "Test Author", type: "run" },
} as unknown as FeedItem;

beforeEach(() => {
  H.giveHighFive.mockReset();
  H.toastError.mockReset();
  H.restriction.isRestricted = false;
});
afterEach(cleanup);

function renderCard() {
  render(
    <MemoryRouter>
      <ActivityCard feedItem={ITEM} />
    </MemoryRouter>
  );
}

const giveProps = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Give props" }));
  });
};

describe("ActivityCard props — a restricted account (S4e)", () => {
  it("gives no props, and says why", async () => {
    H.restriction.isRestricted = true;
    renderCard();
    await giveProps();
    expect(H.giveHighFive).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Give props" })).toBeEnabled();
    expect(H.toastError).toHaveBeenCalledWith(
      RESTRICTED_TOAST,
      expect.anything()
    );
  });

  it("puts the flame back and says why when the server refuses", async () => {
    H.giveHighFive.mockRejectedValue(
      Object.assign(new Error("restricted"), {
        code: "functions/permission-denied",
        details: { reason: "account-restricted" },
      })
    );
    renderCard();
    await giveProps();
    expect(H.giveHighFive).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Give props" })).toBeEnabled();
    expect(H.toastError).toHaveBeenCalledWith(
      RESTRICTED_TOAST,
      expect.anything()
    );
  });

  it("gives props for an account that is not restricted", async () => {
    H.giveHighFive.mockResolvedValue(true);
    renderCard();
    await giveProps();
    expect(H.giveHighFive).toHaveBeenCalledWith("a1", "viewer", {
      fromName: "Someone",
    });
    expect(screen.getByRole("button", { name: "Props given" })).toBeDisabled();
  });
});
