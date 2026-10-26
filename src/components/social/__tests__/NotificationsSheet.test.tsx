import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NotificationsSheet from "../NotificationsSheet";
import type { NotificationItem } from "@/hooks/useNotifications";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom"
    );
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

function item(
  overrides: Partial<NotificationItem> & { id: string }
): NotificationItem {
  return {
    type: "kudos",
    fromUserId: "u-actor",
    fromName: "Alex",
    message: "Alex gave you props",
    createdAt: new Date(),
    ...overrides,
  };
}

function renderSheet(items: NotificationItem[], loading = false) {
  const onOpenChange = vi.fn();
  render(
    <MemoryRouter>
      <NotificationsSheet
        open={true}
        onOpenChange={onOpenChange}
        items={items}
        loading={loading}
      />
    </MemoryRouter>
  );
  return { onOpenChange };
}

describe("NotificationsSheet", () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  it("renders each notification's message", () => {
    renderSheet([
      item({ id: "a", message: "Alex gave you props" }),
      item({
        id: "b",
        type: "comment",
        message: "Sam commented on your activity",
      }),
    ]);
    expect(screen.getByText("Alex gave you props")).toBeInTheDocument();
    expect(
      screen.getByText("Sam commented on your activity")
    ).toBeInTheDocument();
  });

  it("falls back to type-derived copy when message is missing", () => {
    renderSheet([
      item({ id: "f", type: "follow", message: undefined, fromName: "Robin" }),
    ]);
    expect(screen.getByText("Robin started following you")).toBeInTheDocument();
  });

  it("a follow request opens the asker's profile, where it is answered", () => {
    renderSheet([
      item({
        id: "r",
        type: "follow_request",
        fromUserId: "u-robin",
        message: undefined,
        fromName: "Robin",
      }),
    ]);
    fireEvent.click(screen.getByText("Robin asked to follow you"));
    expect(navigateMock).toHaveBeenCalledWith("/user/u-robin");
  });

  it("CIRCLE-ACTIVITY-NOTIFICATIONS: renders named copy for the four Circle event types", () => {
    renderSheet([
      item({
        id: "m",
        type: "circle_milestone",
        message: undefined,
        fromName: "Mia",
      }),
      item({
        id: "n",
        type: "circle_needs_support",
        message: undefined,
        fromName: "Nas",
      }),
      item({
        id: "j",
        type: "circle_joined",
        message: undefined,
        fromName: "Jo",
      }),
      item({
        id: "r",
        type: "circle_routine_shared",
        message: undefined,
        fromName: "Ravi",
      }),
    ]);
    expect(screen.getByText("Mia hit a milestone")).toBeInTheDocument();
    expect(screen.getByText("Nas could use a nudge")).toBeInTheDocument();
    expect(screen.getByText("Jo joined your circle")).toBeInTheDocument();
    expect(screen.getByText("Ravi shared a routine")).toBeInTheDocument();
  });

  it("a named Circle event deep-links to the actor (unlike anonymous focus-backed)", () => {
    const { onOpenChange } = renderSheet([
      item({
        id: "m",
        type: "circle_milestone",
        message: undefined,
        fromName: "Mia",
        fromUserId: "u-mia",
      }),
    ]);
    fireEvent.click(screen.getByText("Mia hit a milestone"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(navigateMock).toHaveBeenCalledWith("/user/u-mia");
  });

  it("an accepted follow request names who said yes and opens their profile", () => {
    renderSheet([
      item({
        id: "y",
        type: "follow_accepted",
        fromUserId: "u-robin",
        message: undefined,
        fromName: "Robin",
      }),
    ]);
    fireEvent.click(screen.getByText("Robin accepted your follow request"));
    expect(navigateMock).toHaveBeenCalledWith("/user/u-robin");
  });

  it("props open the post, carrying the actor for a post that is gone", () => {
    const { onOpenChange } = renderSheet([
      item({ id: "k", activityId: "act-1", message: "Alex gave you props" }),
    ]);
    fireEvent.click(screen.getByText("Alex gave you props"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(navigateMock).toHaveBeenCalledWith("/activity/act-1", {
      state: { fallbackUserId: "u-actor" },
    });
  });

  it("a comment opens the post with its comments open", () => {
    renderSheet([
      item({
        id: "c",
        type: "comment",
        activityId: "act-2",
        fromUserId: "u-sam",
        message: "Sam commented on your activity",
      }),
    ]);
    fireEvent.click(screen.getByText("Sam commented on your activity"));
    expect(navigateMock).toHaveBeenCalledWith("/activity/act-2?comments=1", {
      state: { fallbackUserId: "u-sam" },
    });
  });

  it("props without a post id still open the actor's profile", () => {
    const { onOpenChange } = renderSheet([
      item({ id: "a", fromUserId: "u-actor", message: "Alex gave you props" }),
    ]);
    fireEvent.click(screen.getByText("Alex gave you props"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(navigateMock).toHaveBeenCalledWith("/user/u-actor");
  });

  it("shows the empty state when there are no notifications", () => {
    renderSheet([]);
    expect(screen.getByText("No notifications yet")).toBeInTheDocument();
    // In the app's own words (props, not kudos), and only what notifies
    // by default: new followers are off until the person turns them on.
    expect(
      screen.getByText(
        "Props and comments on your sessions, and news from your circles and spaces, show up here."
      )
    ).toBeInTheDocument();
  });

  it("shows a loading state instead of the empty state while loading", () => {
    renderSheet([], true);
    expect(screen.queryByText("No notifications yet")).not.toBeInTheDocument();
  });
});

describe("NotificationsSheet — NOTIFICATION-TRUST-01 error state", () => {
  it("renders a truthful unavailable state + Try again, not the empty state", () => {
    const onRetry = vi.fn();
    render(
      <MemoryRouter>
        <NotificationsSheet
          open
          onOpenChange={vi.fn()}
          items={[]}
          loading={false}
          error
          onRetry={onRetry}
        />
      </MemoryRouter>
    );
    expect(screen.getByText(/notifications unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/no notifications yet/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("NotificationsSheet — space-post engagement rows (SOC-P2g)", () => {
  beforeEach(() => navigateMock.mockClear());

  it("props on a space post open the post, and the Space if it is gone", () => {
    const { onOpenChange } = renderSheet([
      item({
        id: "sl1",
        type: "space_post_like",
        spaceId: "runners",
        postId: "p-1",
        message: "Alex gave your space post props",
      }),
    ]);
    fireEvent.click(screen.getByText("Alex gave your space post props"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(navigateMock).toHaveBeenCalledWith("/space/runners/post/p-1", {
      state: { fallbackToSpace: true },
    });
  });

  it("a comment on a space post opens the post with its comments open", () => {
    renderSheet([
      item({
        id: "sc1",
        type: "space_post_comment",
        spaceId: "lifters",
        postId: "p-2",
        message: "Sam commented on your space post",
      }),
    ]);
    fireEvent.click(screen.getByText("Sam commented on your space post"));
    expect(navigateMock).toHaveBeenCalledWith(
      "/space/lifters/post/p-2?comments=1",
      { state: { fallbackToSpace: true } }
    );
  });

  it("a post id is spelled safely into the path", () => {
    renderSheet([
      item({
        id: "sl3",
        type: "space_post_like",
        spaceId: "runners",
        postId: "a/b?c",
        message: "Props on a strange id",
      }),
    ]);
    fireEvent.click(screen.getByText("Props on a strange id"));
    expect(navigateMock).toHaveBeenCalledWith("/space/runners/post/a%2Fb%3Fc", {
      state: { fallbackToSpace: true },
    });
  });

  it("a space row stored without its post opens the SPACE", () => {
    renderSheet([
      item({
        id: "sc2",
        type: "space_post_comment",
        spaceId: "lifters",
        message: "Sam commented on your space post",
      }),
    ]);
    fireEvent.click(screen.getByText("Sam commented on your space post"));
    expect(navigateMock).toHaveBeenCalledWith("/space/lifters");
  });

  it("falls back to the actor when a space row is missing spaceId", () => {
    renderSheet([
      item({
        id: "sl2",
        type: "space_post_like",
        postId: "p-1",
        message: "Props!",
      }),
    ]);
    fireEvent.click(screen.getByText("Props!"));
    expect(navigateMock).toHaveBeenCalledWith("/user/u-actor");
  });
});
