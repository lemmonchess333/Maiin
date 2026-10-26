// @vitest-environment jsdom
/**
 * When a sign-out may clear the device's Firestore copy, and the mark that
 * hands the clear to the next boot (firestoreCacheClear.ts). Clearing drops
 * writes not yet sent, so every way of NOT being sure the writes went up
 * has to answer false.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  markFirestoreCacheForClearing,
  takeFirestoreCacheClearMark,
  writesSettled,
} from "../firestoreCacheClear";

beforeEach(() => localStorage.clear());

describe("writesSettled", () => {
  it("is true once the writes are acknowledged", async () => {
    await expect(writesSettled(async () => {}, { online: true })).resolves.toBe(
      true
    );
  });

  it("is false offline, without waiting", async () => {
    const wait = vi.fn(async () => {});
    await expect(writesSettled(wait, { online: false })).resolves.toBe(false);
    expect(wait).not.toHaveBeenCalled();
  });

  it("is false when the writes are still waiting after the time allowed", async () => {
    await expect(
      writesSettled(() => new Promise<void>(() => {}), {
        online: true,
        timeoutMs: 10,
      })
    ).resolves.toBe(false);
  });

  it("is false when the check itself fails", async () => {
    await expect(
      writesSettled(
        async () => {
          throw new Error("terminated");
        },
        { online: true }
      )
    ).resolves.toBe(false);
  });
});

describe("the mark for the next boot", () => {
  it("is taken once", () => {
    expect(takeFirestoreCacheClearMark()).toBe(false);
    markFirestoreCacheForClearing();
    expect(takeFirestoreCacheClearMark()).toBe(true);
    expect(takeFirestoreCacheClearMark()).toBe(false);
  });
});
