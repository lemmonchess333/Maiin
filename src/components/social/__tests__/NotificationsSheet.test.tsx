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
    expect(screen.getByText("Jo joined your Circle")).toBeInTheDocument();
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

  it("tapping a row deep-links to the actor's profile and closes the sheet", () => {
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
