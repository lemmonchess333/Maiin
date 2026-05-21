/**
 * useFeedSubTabFreshness — Soc5b pin (3) contract tests.
 *
 * Pin spec: subtle dot indicator on Feed sub-tab when new content
 * since last view; cleared on tab view. Calm positioning — never a
 * count badge.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFeedSubTabFreshness } from "../useFeedSubTabFreshness";

const FOLLOWING_KEY = "tropos-social-feed-following-last-viewed";
const EXPLORE_KEY = "tropos-social-feed-explore-last-viewed";

function ts(iso: string) {
  return { toDate: () => new Date(iso) };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("useFeedSubTabFreshness — active sub-tab", () => {
  it("never reports a dot for the active sub-tab", () => {
    const { result } = renderHook(() =>
      useFeedSubTabFreshness({
        activeSubTab: "following",
        followingNewestCreatedAt: ts("2026-05-21T10:00:00Z"),
        exploreNewestCreatedAt: ts("2026-05-21T10:00:00Z"),
      }),
    );
    expect(result.current.followingHasNew).toBe(false);
  });

  it("syncs the active sub-tab's seen pointer to localStorage", () => {
    renderHook(() =>
      useFeedSubTabFreshness({
        activeSubTab: "following",
        followingNewestCreatedAt: ts("2026-05-21T10:00:00Z"),
        exploreNewestCreatedAt: ts("2026-05-21T08:00:00Z"),
      }),
    );
    expect(window.localStorage.getItem(FOLLOWING_KEY)).toBe(
      "2026-05-21T10:00:00.000Z",
    );
  });
});

describe("useFeedSubTabFreshness — inactive sub-tab dot", () => {
  it("renders a dot when inactive sub-tab has newer content than stored", () => {
    window.localStorage.setItem(EXPLORE_KEY, "2026-05-21T08:00:00.000Z");
    const { result } = renderHook(() =>
      useFeedSubTabFreshness({
        activeSubTab: "following",
        followingNewestCreatedAt: ts("2026-05-21T08:00:00Z"),
        exploreNewestCreatedAt: ts("2026-05-21T10:00:00Z"),
      }),
    );
    expect(result.current.exploreHasNew).toBe(true);
  });

  it("hides the dot when inactive sub-tab content is older than stored", () => {
    window.localStorage.setItem(EXPLORE_KEY, "2026-05-21T12:00:00.000Z");
    const { result } = renderHook(() =>
      useFeedSubTabFreshness({
        activeSubTab: "following",
        followingNewestCreatedAt: ts("2026-05-21T08:00:00Z"),
        exploreNewestCreatedAt: ts("2026-05-21T10:00:00Z"),
      }),
    );
    expect(result.current.exploreHasNew).toBe(false);
  });

  it("hides the dot when inactive sub-tab has no items", () => {
    window.localStorage.setItem(EXPLORE_KEY, "0");
    const { result } = renderHook(() =>
      useFeedSubTabFreshness({
        activeSubTab: "following",
        followingNewestCreatedAt: ts("2026-05-21T08:00:00Z"),
        exploreNewestCreatedAt: undefined,
      }),
    );
    expect(result.current.exploreHasNew).toBe(false);
  });
});

describe("useFeedSubTabFreshness — persistence semantics", () => {
  it("clears the dot when switching to the sub-tab (active syncs forward)", () => {
    window.localStorage.setItem(EXPLORE_KEY, "2026-05-21T08:00:00.000Z");
    const { result, rerender } = renderHook(
      ({ active }: { active: "following" | "explore" }) =>
        useFeedSubTabFreshness({
          activeSubTab: active,
          followingNewestCreatedAt: ts("2026-05-21T08:00:00Z"),
          exploreNewestCreatedAt: ts("2026-05-21T10:00:00Z"),
        }),
      { initialProps: { active: "following" as "following" | "explore" } },
    );
    expect(result.current.exploreHasNew).toBe(true);

    rerender({ active: "explore" });
    expect(result.current.exploreHasNew).toBe(false);
    expect(window.localStorage.getItem(EXPLORE_KEY)).toBe(
      "2026-05-21T10:00:00.000Z",
    );
  });

  it("survives malformed localStorage values (graceful 0 fallback)", () => {
    window.localStorage.setItem(EXPLORE_KEY, "");
    const { result } = renderHook(() =>
      useFeedSubTabFreshness({
        activeSubTab: "following",
        followingNewestCreatedAt: ts("2026-05-21T08:00:00Z"),
        exploreNewestCreatedAt: ts("2026-05-21T10:00:00Z"),
      }),
    );
    /* Empty string is the localStorage value (returned, not defaulted),
       and any ISO date > "" — so a dot fires. This is the
       graceful-fallback behaviour: better to show a dot the first time
       than to suppress it forever. */
    expect(result.current.exploreHasNew).toBe(true);
  });
});
