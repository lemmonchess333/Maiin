// @vitest-environment jsdom
/**
 * The reveal queue, fed by the server's record (App1 Q33): a badge the
 * server awarded within the window is queued once per badge per device,
 * survives a reload, and stays dismissed once dismissed.
 */
import { beforeEach, expect, it, vi } from "vitest";
import { remove, scopedKey } from "@/lib/localStore";

const NOW = Date.parse("2026-05-20T12:00:00.000Z");
const DAY_MS = 86_400_000;
const award = (id: string, agoMs = 0) => ({
  id,
  earnedAt: new Date(NOW - agoMs).toISOString(),
  earnedBy: { kind: "workout", id: "w1" },
});

beforeEach(() => {
  vi.resetModules();
  for (const uid of ["reveal-a", "reveal-b"]) {
    remove(scopedKey("pendingBadgeReveals", uid));
    remove(scopedKey("badgeRevealsQueued", uid));
  }
});

it("survives a fresh module load and only removes the revealed badge", async () => {
  let queue = await import("../pendingBadgeReveals");
  queue.queueServerAwards(
    "reveal-a",
    [award("first_pr"), award("programme_complete"), award("first_pr")],
    NOW
  );
  vi.resetModules();
  queue = await import("../pendingBadgeReveals");
  expect(queue.pendingBadgeIds("reveal-a")).toEqual([
    "first_pr",
    "programme_complete",
  ]);
  queue.dismissBadgeReveal("reveal-a", "first_pr");
  vi.resetModules();
  queue = await import("../pendingBadgeReveals");
  expect(queue.pendingBadgeIds("reveal-a")).toEqual(["programme_complete"]);
});

it("queues each badge once per device: a dismissed reveal stays dismissed", async () => {
  const queue = await import("../pendingBadgeReveals");
  queue.queueServerAwards("reveal-a", [award("first_pr")], NOW);
  queue.dismissBadgeReveal("reveal-a", "first_pr");
  // The same record read again, and with a new award beside it.
  queue.queueServerAwards(
    "reveal-a",
    [award("first_pr"), award("plate_club")],
    NOW
  );
  expect(queue.pendingBadgeIds("reveal-a")).toEqual(["plate_club"]);
});

it("queues only the server's awards within the window", async () => {
  const queue = await import("../pendingBadgeReveals");
  const window = queue.BADGE_REVEAL_WINDOW_DAYS * DAY_MS;
  queue.queueServerAwards(
    "reveal-a",
    [
      award("first_step", window), // the window's last moment: revealed
      award("three_day", window + 1), // past it
      // Earned before the server awarded badges: no earnedBy.
      { id: "week_warrior", earnedAt: new Date(NOW).toISOString() },
      // Not earned.
      { id: "two_week", earnedAt: null, earnedBy: { kind: "streak" } },
      null,
      "junk",
    ],
    NOW
  );
  expect(queue.pendingBadgeIds("reveal-a")).toEqual(["first_step"]);
});

it("never exposes another account's queue and notifies mounted consumers", async () => {
  const queue = await import("../pendingBadgeReveals");
  const listener = vi.fn();
  const unsubscribe = queue.subscribePendingBadges(listener);
  queue.queueServerAwards("reveal-a", [award("first_pr")], NOW);
  expect(listener).toHaveBeenCalledOnce();
  expect(queue.pendingBadgeIds("reveal-b")).toEqual([]);
  expect(queue.pendingBadgeIds(null)).toEqual([]);
  unsubscribe();
  queue.queueServerAwards("reveal-b", [award("programme_complete")], NOW);
  expect(listener).toHaveBeenCalledOnce();
  expect(queue.pendingBadgeIds("reveal-a")).toEqual(["first_pr"]);
});
