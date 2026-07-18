/**
 * useFeedSubTabFreshness — Soc5b pin (3) contract tests.
 *
 * Pin spec: subtle dot indicator on Feed sub-tab when new content
 * since last view; cleared on tab view. Calm positioning — never a
 * count badge.
 *
 * SOCIAL-ATTENTION-01: seen pointers are uid-scoped, so the keys are
 * derived via `socialPreferenceKey`, and an account switch re-reads
 * the new account's pointers.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFeedSubTabFreshness } from "../useFeedSubTabFreshness";
import { socialPreferenceKey } from "@/lib/socialPreferenceKeys";

const UID = "user-a";
const FOLLOWING_KEY = socialPreferenceKey(UID, "feed-following-last-viewed");
const EXPLORE_KEY = socialPreferenceKey(UID, "feed-explore-last-viewed");

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
        uid: UID,
      })
    );
    expect(result.current.followingHasNew).toBe(false);
  });

  it("syncs the active sub-tab's seen pointer to localStorage", () => {
    renderHook(() =>
      useFeedSubTabFreshness({
        activeSubTab: "following",
        followingNewestCreatedAt: ts("2026-05-21T10:00:00Z"),
        exploreNewestCreatedAt: ts("2026-05-21T08:00:00Z"),
        uid: UID,
      })
    );
    expect(window.localStorage.getItem(FOLLOWING_KEY)).toBe(
      "2026-05-21T10:00:00.000Z"
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
        uid: UID,
      })
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
        uid: UID,
      })
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
        uid: UID,
      })
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
          uid: UID,
        }),
      { initialProps: { active: "following" as "following" | "explore" } }
    );
    expect(result.current.exploreHasNew).toBe(true);

    rerender({ active: "explore" });
    expect(result.current.exploreHasNew).toBe(false);
    expect(window.localStorage.getItem(EXPLORE_KEY)).toBe(
      "2026-05-21T10:00:00.000Z"
    );
  });

  it("survives malformed localStorage values (graceful 0 fallback)", () => {
    window.localStorage.setItem(EXPLORE_KEY, "");
    const { result } = renderHook(() =>
      useFeedSubTabFreshness({
        activeSubTab: "following",
        followingNewestCreatedAt: ts("2026-05-21T08:00:00Z"),
        exploreNewestCreatedAt: ts("2026-05-21T10:00:00Z"),
        uid: UID,
      })
    );
    /* Empty string is the localStorage value (returned, not defaulted),
       and any ISO date > "" — so a dot fires. This is the
       graceful-fallback behaviour: better to show a dot the first time
       than to suppress it forever. */
    expect(result.current.exploreHasNew).toBe(true);
  });
});

describe("useFeedSubTabFreshness — uid scoping (SOCIAL-ATTENTION-01)", () => {
  it("does not leak account A's seen pointer to account B on the same browser", () => {
    // Account A marked explore seen up to 10:00.
    window.localStorage.setItem(EXPLORE_KEY, "2026-05-21T10:00:00.000Z");

    const { result, rerender } = renderHook(
      ({ uid }: { uid: string }) =>
        useFeedSubTabFreshness({
          activeSubTab: "following",
          followingNewestCreatedAt: ts("2026-05-21T08:00:00Z"),
          exploreNewestCreatedAt: ts("2026-05-21T09:00:00Z"),
          uid,
        }),
      { initialProps: { uid: UID } }
    );
    // A: 09:00 content is older than A's 10:00 pointer → no dot.
    expect(result.current.exploreHasNew).toBe(false);

    // Switch to account B on the same browser — B has no pointer, so
    // 09:00 content is "new" to B (it doesn't inherit A's 10:00).
    rerender({ uid: "user-b" });
    expect(result.current.exploreHasNew).toBe(true);
    // B's write lands under B's key, never A's.
    expect(window.localStorage.getItem(EXPLORE_KEY)).toBe(
      "2026-05-21T10:00:00.000Z"
    );
  });

  it("purges the pre-scoping global keys on mount (never migrated)", () => {
    window.localStorage.setItem(
      "tropos-social-feed-following-last-viewed",
      "2026-05-21T10:00:00.000Z"
    );
    window.localStorage.setItem(
      "tropos-social-feed-explore-last-viewed",
      "2026-05-21T10:00:00.000Z"
    );
    renderHook(() =>
      useFeedSubTabFreshness({
        activeSubTab: "following",
        followingNewestCreatedAt: ts("2026-05-21T08:00:00Z"),
        exploreNewestCreatedAt: ts("2026-05-21T09:00:00Z"),
        uid: UID,
      })
    );
    expect(
      window.localStorage.getItem("tropos-social-feed-following-last-viewed")
    ).toBeNull();
    expect(
      window.localStorage.getItem("tropos-social-feed-explore-last-viewed")
    ).toBeNull();
  });
});
