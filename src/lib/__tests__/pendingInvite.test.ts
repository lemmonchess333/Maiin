// @vitest-environment jsdom
/**
 * An invite link's code, kept on the device until setup uses it
 * (`pendingInvite.ts`). The link opens the web app signed out, and the
 * person may sign up with Google or Apple and answer every question before
 * there is an account to use the code with, so it has to survive the
 * address changing, a reload and a sign-in round trip, and then leave.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  captureInviteFromUrl,
  clearPendingInvite,
  readPendingInvite,
  savePendingInvite,
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

  it("refuses to keep something that is not a code", () => {
    expect(savePendingInvite("nope")).toBe(false);
    expect(readPendingInvite()).toBeNull();
  });
});
