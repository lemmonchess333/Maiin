// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { remove, scopedKey } from "@/lib/localStore";

beforeEach(() => {
  vi.resetModules();
  for (const uid of ["reveal-a", "reveal-b"])
    remove(scopedKey("pendingBadgeReveals", uid));
});
it("survives a fresh module load and only removes the revealed badge", async () => {
  let queue = await import("../pendingBadgeReveals");
  queue.queueBadgeReveals("reveal-a", [
    "first_pr",
    "programme_complete",
    "first_pr",
  ]);
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
it("never exposes another account's queue and notifies mounted consumers", async () => {
  const queue = await import("../pendingBadgeReveals");
  const listener = vi.fn();
  const unsubscribe = queue.subscribePendingBadges(listener);
  queue.queueBadgeReveals("reveal-a", ["first_pr"]);
  expect(listener).toHaveBeenCalledOnce();
  expect(queue.pendingBadgeIds("reveal-b")).toEqual([]);
  expect(queue.pendingBadgeIds(null)).toEqual([]);
  unsubscribe();
  queue.queueBadgeReveals("reveal-b", ["programme_complete"]);
  expect(listener).toHaveBeenCalledOnce();
  expect(queue.pendingBadgeIds("reveal-a")).toEqual(["first_pr"]);
});
