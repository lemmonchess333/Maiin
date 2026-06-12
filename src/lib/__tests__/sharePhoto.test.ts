/**
 * sharePhoto — Web Share API photo handoff (Food share-card → iOS share sheet).
 * isPhotoShareSupported is a cached capability check (false on web, where there's
 * no file-capable Web Share). sharePhotoToLibrary converts a base64 image to a
 * File and shares it, with guards for empty/malformed input, an unsupported
 * platform, and user-cancel (AbortError) — each must resolve to false, never
 * throw, so the caller can fall back gracefully.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isPhotoShareSupported, sharePhotoToLibrary } from "../sharePhoto";

// btoa("hello") — a valid base64 payload for the happy path.
const VALID_B64 = "aGVsbG8=";

function setNavigator(
  canShare: ((data?: unknown) => boolean) | undefined,
  share: ((data?: unknown) => Promise<void>) | undefined
) {
  Object.defineProperty(navigator, "canShare", {
    value: canShare,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(navigator, "share", {
    value: share,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  setNavigator(undefined, undefined);
  vi.restoreAllMocks();
});

describe("isPhotoShareSupported", () => {
  it("is false on web (no file-capable Web Share in jsdom) — cached capability", () => {
    // Computed at import from navigator.canShare, absent in jsdom → false.
    expect(isPhotoShareSupported()).toBe(false);
  });
});

describe("sharePhotoToLibrary", () => {
  beforeEach(() => {
    setNavigator(() => true, vi.fn().mockResolvedValue(undefined));
  });

  it("returns false for empty / non-string input without calling share", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigator(() => true, share);
    expect(await sharePhotoToLibrary("")).toBe(false);
    // @ts-expect-error — exercising the runtime guard against a non-string
    expect(await sharePhotoToLibrary(null)).toBe(false);
    expect(share).not.toHaveBeenCalled();
  });

  it("shares a File and returns true on success", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigator(() => true, share);
    expect(await sharePhotoToLibrary(VALID_B64)).toBe(true);
    expect(share).toHaveBeenCalledTimes(1);
    const arg = share.mock.calls[0][0] as { files: File[] };
    expect(arg.files[0]).toBeInstanceOf(File);
  });

  it("strips a data-URL prefix before decoding", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigator(() => true, share);
    expect(
      await sharePhotoToLibrary(`data:image/jpeg;base64,${VALID_B64}`)
    ).toBe(true);
    expect(share).toHaveBeenCalledTimes(1);
  });

  it("returns false (no share) when the platform can't share files", async () => {
    const share = vi.fn();
    setNavigator(() => false, share);
    expect(await sharePhotoToLibrary(VALID_B64)).toBe(false);
    expect(share).not.toHaveBeenCalled();
  });

  it("returns false silently when the user cancels (AbortError)", async () => {
    const abort = Object.assign(new Error("cancelled"), { name: "AbortError" });
    setNavigator(() => true, vi.fn().mockRejectedValue(abort));
    expect(await sharePhotoToLibrary(VALID_B64)).toBe(false);
  });

  it("returns false on malformed base64 (atob throws) — never propagates", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigator(() => true, share);
    // '!!' is not valid base64 → atob throws InvalidCharacterError, caught.
    await expect(sharePhotoToLibrary("!!notbase64!!")).resolves.toBe(false);
  });
});
