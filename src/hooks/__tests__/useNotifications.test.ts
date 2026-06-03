import { describe, it, expect } from "vitest";
import { countUnread, type NotificationItem } from "../useNotifications";

function item(
  overrides: Partial<NotificationItem> & { id: string }
): NotificationItem {
  return {
    type: "kudos",
    fromUserId: "u-from",
    createdAt: new Date("2026-06-03T12:00:00Z"),
    ...overrides,
  };
}

describe("countUnread (#974 social notification reader)", () => {
  const T0 = Date.parse("2026-06-03T12:00:00Z");

  it("counts only items strictly newer than last-seen", () => {
    const items = [
      item({ id: "a", createdAt: new Date(T0 + 5000) }), // newer → unread
      item({ id: "b", createdAt: new Date(T0 - 5000) }), // older → read
      item({ id: "c", createdAt: new Date(T0) }), // equal → not strictly newer → read
    ];
    expect(countUnread(items, T0)).toBe(1);
  });

  it("returns 0 when last-seen is in the future (all seen)", () => {
    const items = [
      item({ id: "a", createdAt: new Date(T0) }),
      item({ id: "b", createdAt: new Date(T0 - 1000) }),
    ];
    expect(countUnread(items, T0 + 60000)).toBe(0);
  });

  it("counts everything when last-seen is 0 (never opened)", () => {
    const items = [item({ id: "a" }), item({ id: "b" }), item({ id: "c" })];
    expect(countUnread(items, 0)).toBe(3);
  });

  it("treats a pending (null) createdAt as unread", () => {
    const items = [item({ id: "a", createdAt: null })];
    expect(countUnread(items, T0)).toBe(1);
  });

  it("is 0 for an empty tray", () => {
    expect(countUnread([], T0)).toBe(0);
  });
});
