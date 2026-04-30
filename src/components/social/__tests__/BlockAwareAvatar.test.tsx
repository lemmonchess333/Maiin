import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/* The wrapper has one job: when the target user is in the current
 * user's blocked set, suppress photoURL and force the initial
 * fallback. This must work in every cross-user social surface
 * (kudos lists, comments, leaderboards, search, suggested people)
 * because that's the surface a malicious user would weaponize their
 * profile photo against — uploading something harassing then
 * banking on the existing block flow not actually hiding it.
 */

const blocked = { value: new Set<string>() };
vi.mock("@/hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({
    blocked: blocked.value,
    addBlocked: () => {},
    removeBlocked: () => {},
  }),
}));

import BlockAwareAvatar from "../BlockAwareAvatar";

describe("BlockAwareAvatar", () => {
  it("renders the photo when the target uid is not blocked", () => {
    blocked.value = new Set();
    render(
      <BlockAwareAvatar
        uid="alice"
        photoURL="https://firebasestorage.googleapis.com/photo.jpg"
        displayName="Alice"
      />,
    );
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toBe("https://firebasestorage.googleapis.com/photo.jpg");
  });

  it("suppresses the photo and falls back to initial when uid is blocked", () => {
    blocked.value = new Set(["alice"]);
    render(
      <BlockAwareAvatar
        uid="alice"
        photoURL="https://firebasestorage.googleapis.com/photo.jpg"
        displayName="Alice"
      />,
    );
    /* No img tag — fallback letter is rendered instead. */
    expect(screen.queryByRole("img")).toBeNull();
    /* Display name passes through; only the photo is suppressed.
       This preserves thread context (who said what in a comment
       chain) while neutralizing image-based harassment. */
    expect(screen.getByText("A")).toBeTruthy();
  });

  it("preserves the displayName for the visible label even when blocked", () => {
    /* The wrapper passes displayName through unchanged. Callers may
       still render the name in surrounding UI; the wrapper isn't
       responsible for hiding the user, only the photo. */
    blocked.value = new Set(["alice"]);
    render(
      <BlockAwareAvatar
        uid="alice"
        photoURL="https://firebasestorage.googleapis.com/photo.jpg"
        displayName="Alice"
      />,
    );
    /* The fallback initial comes from displayName="Alice" → "A". */
    expect(screen.getByText("A")).toBeTruthy();
  });

  it("no-ops the block check when uid is undefined (legacy records)", () => {
    /* Pre-denormalization comments may not carry an authorId.
       Better to render the photo than to break the avatar. The
       moderation gap this introduces is bounded — only legacy
       comments without authorIds, which are read-only artifacts. */
    blocked.value = new Set(["alice"]);
    render(
      <BlockAwareAvatar
        uid={undefined}
        photoURL="https://firebasestorage.googleapis.com/photo.jpg"
        displayName="Alice"
      />,
    );
    expect(screen.getByRole("img")).toBeTruthy();
  });

  it("falls back to initial when no photoURL is provided regardless of block state", () => {
    blocked.value = new Set();
    render(<BlockAwareAvatar uid="alice" displayName="Alice" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("A")).toBeTruthy();
  });
});
