// @vitest-environment jsdom
/**
 * An invite link's code, kept on the device until setup uses it
 * (`pendingInvite.ts`). The link opens the web app signed out, and the
 * person may sign up with Google or Apple and answer every question before
 * there is an account to use the code with, so it has to survive the
 * address changing, a reload and a sign-in round trip, and then leave.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureInviteFromUrl,
  clearPendingInvite,
  readPendingInvite,
  savePendingInvite,
  snapshotPendingInvite,
} from "@/lib/pendingInvite";

const DAY = 86_400_000;

/** A window stand-in at `href`, recording where the address went. */
function at(href: string) {
  const replaced: string[] = [];
  return {
    replaced,
    win: {
      location: { href } as Location,
      history: {
        state: { idx: 0 },
        replaceState: (_s: unknown, _t: string, url: string) => {
          replaced.push(url);
        },
      } as unknown as History,
    },
  };
}

beforeEach(() => clearPendingInvite());
afterEach(() => clearPendingInvite());

describe("captureInviteFromUrl", () => {
  it("keeps the code and takes it out of the address, leaving the rest", () => {
    const { win, replaced } = at(
      "https://troposfit.com/?invite=k7p4-9m2h&utm_source=messages#top"
    );
    expect(captureInviteFromUrl(win)).toBe("K7P49M2H");
    expect(readPendingInvite()).toBe("K7P49M2H");
    expect(replaced).toEqual(["/?utm_source=messages#top"]);
  });

  it("keeps the app's base path", () => {
    const { win, replaced } = at(
      "https://lemmonchess333.github.io/Maiin/?invite=K7P49M2H"
    );
    captureInviteFromUrl(win);
    expect(replaced).toEqual(["/Maiin/"]);
  });

  it("drops a parameter that is not a code, and keeps nothing", () => {
    const { win, replaced } = at("https://troposfit.com/?invite=hello");
    expect(captureInviteFromUrl(win)).toBeNull();
    expect(readPendingInvite()).toBeNull();
    expect(replaced).toEqual(["/"]);
  });

  it("leaves an address with no invite alone", () => {
    const { win, replaced } = at("https://troposfit.com/social?tab=find");
    expect(captureInviteFromUrl(win)).toBeNull();
    expect(replaced).toEqual([]);
  });

  it("does not let a later link without a code clear the one waiting", () => {
    captureInviteFromUrl(at("https://troposfit.com/?invite=K7P49M2H").win);
    captureInviteFromUrl(at("https://troposfit.com/").win);
    expect(readPendingInvite()).toBe("K7P49M2H");
  });
});

describe("the waiting code", () => {
  it("lasts the 14 days an account may use one, and no longer", () => {
    const now = Date.UTC(2026, 10, 4);
    savePendingInvite("K7P49M2H", now);
    expect(readPendingInvite(now + 14 * DAY)).toBe("K7P49M2H");
    expect(readPendingInvite(now + 14 * DAY + 1)).toBeNull();
  });

  it("is gone once cleared", () => {
    savePendingInvite("K7P49M2H");
    clearPendingInvite();
    expect(readPendingInvite()).toBeNull();
  });

  it("keeps a blocked-storage invite in memory for the current screen", () => {
    const blocked = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    try {
      expect(savePendingInvite("K7P49M2H")).toBe(false);
      expect(readPendingInvite()).toBe("K7P49M2H");
      clearPendingInvite();
      expect(readPendingInvite()).toBeNull();
    } finally {
      blocked.mockRestore();
    }
  });

  it("does not resurrect a stored code when removal is blocked", () => {
    savePendingInvite("K7P49M2H");
    const blocked = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    try {
      clearPendingInvite();
      expect(readPendingInvite()).toBeNull();
    } finally {
      blocked.mockRestore();
      clearPendingInvite();
    }
  });

  it("does not clear a newer code when an older request completes", () => {
    savePendingInvite("K7P49M2H");
    const old = snapshotPendingInvite();
    savePendingInvite("A2B3C4D5");
    clearPendingInvite(old);
    expect(readPendingInvite()).toBe("A2B3C4D5");
    clearPendingInvite(snapshotPendingInvite());
    expect(readPendingInvite()).toBeNull();
  });

  it("preserves a newly delivered link even when it repeats the same code", () => {
    savePendingInvite("K7P49M2H");
    const old = snapshotPendingInvite();
    savePendingInvite("K7P49M2H");
    clearPendingInvite(old);
    expect(readPendingInvite()).toBe("K7P49M2H");
  });

  it("refuses to keep something that is not a code", () => {
    expect(savePendingInvite("nope")).toBe(false);
    expect(readPendingInvite()).toBeNull();
  });
});
