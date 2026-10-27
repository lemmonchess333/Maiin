import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, within } from "@testing-library/react";
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

/* The requests still waiting, as People's section reads them. The tray
   answers through the same hook, so its callables and its failure path
   are the section's. */
const requests = vi.hoisted(() => ({
  enabled: [] as boolean[],
  waiting: [] as { uid: string; displayName: string; requestedAt: null }[],
  accept: vi.fn(async (_uid: string) => true),
  decline: vi.fn(async (_uid: string) => true),
}));
vi.mock("@/hooks/useFollowRequests", () => ({
  useFollowRequests: (enabled: boolean) => {
    requests.enabled.push(enabled);
    return {
      requests: requests.waiting,
      status: "ready",
      reload: vi.fn(),
      accept: requests.accept,
      decline: requests.decline,
    };
  },
}));

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

describe("NotificationsSheet — answering a follow request from its row", () => {
  const ask = () =>
    item({
      id: "r",
      type: "follow_request",
      fromUserId: "u-robin",
      message: undefined,
      fromName: "Robin",
    });

  beforeEach(() => {
    navigateMock.mockClear();
    requests.enabled.length = 0;
    requests.waiting = [
      { uid: "u-robin", displayName: "Robin", requestedAt: null },
    ];
    requests.accept.mockReset().mockResolvedValue(true);
    requests.decline.mockReset().mockResolvedValue(true);
  });

  it("offers Accept and Decline beside a request still waiting", () => {
    renderSheet([ask()]);
    const accept = screen.getByRole("button", { name: "Accept Robin" });
    const decline = screen.getByRole("button", { name: "Decline Robin" });
    // Beside the row, not inside it: no control holds another.
    const body = screen
      .getByText("Robin asked to follow you")
      .closest("button") as HTMLElement;
    expect(within(body).queryByRole("button")).toBeNull();
    expect(body.contains(accept)).toBe(false);
    expect(body.contains(decline)).toBe(false);
  });

  it("still opens the asker's profile from the row itself", () => {
    renderSheet([ask()]);
    fireEvent.click(screen.getByText("Robin asked to follow you"));
    expect(navigateMock).toHaveBeenCalledWith("/user/u-robin");
  });

  it("accepts through People's own handler, and says it is done", async () => {
    renderSheet([ask()]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Accept Robin" }));
    });
    expect(requests.accept).toHaveBeenCalledWith("u-robin");
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Accept Robin" })).toBeNull();
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });

  it("declines through the same handler, with no follow", async () => {
    renderSheet([ask()]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Decline Robin" }));
    });
    expect(requests.decline).toHaveBeenCalledWith("u-robin");
    expect(requests.accept).not.toHaveBeenCalled();
    expect(screen.getByText("Declined")).toBeInTheDocument();
  });

  it("keeps both answers when one fails, as the hook puts the request back", async () => {
    requests.accept.mockResolvedValue(false);
    renderSheet([ask()]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Accept Robin" }));
    });
    expect(screen.queryByText("Accepted")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Accept Robin" })
    ).toBeInTheDocument();
  });

  it("offers nothing on a request answered elsewhere", () => {
    requests.waiting = [];
    renderSheet([ask()]);
    // POSITIVE anchor: the row is drawn.
    expect(screen.getByText("Robin asked to follow you")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept Robin" })).toBeNull();
  });

  it("reads the requests only while a request row is open", () => {
    renderSheet([item({ id: "k", message: "Alex gave you props" })]);
    expect(requests.enabled.every((on) => on === false)).toBe(true);
    expect(requests.enabled.length).toBeGreaterThan(0);
    renderSheet([ask()]);
    expect(requests.enabled.at(-1)).toBe(true);
  });
});
