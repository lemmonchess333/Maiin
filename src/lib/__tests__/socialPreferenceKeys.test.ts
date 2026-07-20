// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  socialPreferenceKey,
  purgeLegacySocialKey,
} from "../socialPreferenceKeys";

describe("socialPreferenceKey", () => {
  it("scopes a family by uid so two accounts never collide", () => {
    const a = socialPreferenceKey("user-a", "unread-last-seen");
    const b = socialPreferenceKey("user-b", "unread-last-seen");
    expect(a).not.toBe(b);
    expect(a).toContain("user-a");
    expect(b).toContain("user-b");
  });

  it("is stable for a given (uid, family)", () => {
    expect(socialPreferenceKey("me", "unread-last-seen")).toBe(
      socialPreferenceKey("me", "unread-last-seen")
    );
  });

  it("produces distinct keys per family", () => {
    const uid = "me";
    const keys = new Set([
      socialPreferenceKey(uid, "unread-last-seen"),
      socialPreferenceKey(uid, "feed-following-last-viewed"),
      socialPreferenceKey(uid, "feed-explore-last-viewed"),
    ]);
    expect(keys.size).toBe(3);
  });
});

describe("purgeLegacySocialKey", () => {
  beforeEach(() => window.localStorage.clear());

  it("removes the pre-scoping global key and is a no-op when absent", () => {
    window.localStorage.setItem("tropos-social-last-seen", "x");
    purgeLegacySocialKey("unread-last-seen");
    expect(window.localStorage.getItem("tropos-social-last-seen")).toBeNull();
    // Idempotent — calling again on an already-purged key doesn't throw.
    expect(() => purgeLegacySocialKey("unread-last-seen")).not.toThrow();
  });

  it("maps each family to its historical global key", () => {
    window.localStorage.setItem(
      "tropos-social-feed-following-last-viewed",
      "x"
    );
    window.localStorage.setItem("tropos-social-feed-explore-last-viewed", "x");
    purgeLegacySocialKey("feed-following-last-viewed");
    purgeLegacySocialKey("feed-explore-last-viewed");
    expect(
      window.localStorage.getItem("tropos-social-feed-following-last-viewed")
    ).toBeNull();
    expect(
      window.localStorage.getItem("tropos-social-feed-explore-last-viewed")
    ).toBeNull();
  });
});
