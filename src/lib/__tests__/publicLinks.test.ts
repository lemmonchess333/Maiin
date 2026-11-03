/**
 * The link an invite shares (`publicLinks.ts`). It was the page's own
 * origin: `capacitor://localhost` from the iPhone app, which opens
 * nothing for the person it is sent to, and the GitHub Pages host with
 * the app's `/Maiin/` base dropped. The two share buttons are held to it
 * in `PeopleView.test.tsx` and `CirclesSection.invite.test.tsx`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { appInviteUrl, PUBLIC_APP_ORIGIN } from "@/lib/publicLinks";

afterEach(() => vi.unstubAllGlobals());

describe("appInviteUrl", () => {
  it("is the production web app", () => {
    expect(PUBLIC_APP_ORIGIN).toBe("https://troposfit.com");
    expect(appInviteUrl()).toBe("https://troposfit.com");
  });

  it.each([
    ["the iPhone app", "capacitor://localhost/"],
    [
      "the GitHub Pages preview",
      "https://lemmonchess333.github.io/Maiin/social",
    ],
    ["a local dev server", "http://localhost:5173/social"],
  ])("is the same from %s", (_where, href) => {
    const url = new URL(href);
    vi.stubGlobal("location", {
      href,
      origin: url.origin,
      pathname: url.pathname,
    });
    expect(globalThis.location.href).toBe(href);
    expect(appInviteUrl()).toBe("https://troposfit.com");
  });
});
