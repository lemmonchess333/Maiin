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
      item({ id: "b", type: "comment", message: "Sam commented on your activity" }),
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
