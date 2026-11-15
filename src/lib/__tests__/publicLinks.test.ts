/**
 * The link an invite shares (`publicLinks.ts`). It was the page's own
 * origin: `capacitor://localhost` from the iPhone app, which opens
 * nothing for the person it is sent to, and the GitHub Pages host with
 * the app's `/Maiin/` base dropped. The two share buttons are held to it
 * in `PeopleView.test.tsx` and `CirclesSection.invite.test.tsx`. A
 * person's invite (Soc15) carries their code in the same address.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APP_STORE_URL,
  appInviteUrl,
  PUBLIC_APP_ORIGIN,
  publicPostUrl,
  withAppLink,
} from "@/lib/publicLinks";

afterEach(() => vi.unstubAllGlobals());

describe("appInviteUrl", () => {
  it("is the production web app", () => {
    expect(PUBLIC_APP_ORIGIN).toBe("https://troposfit.com");
    expect(appInviteUrl()).toBe("https://troposfit.com");
  });

  it("carries a person's invite code (Soc15)", () => {
    expect(appInviteUrl("K7P49M2H")).toBe(
      "https://troposfit.com/?invite=K7P49M2H"
    );
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
    expect(appInviteUrl("K7P49M2H")).toBe(
      "https://troposfit.com/?invite=K7P49M2H"
    );
  });
});

describe("withAppLink", () => {
  it("ends a shared card's words with the way back to Tropos (Q69)", () => {
    expect(withAppLink("My run on Tropos")).toBe(
      "My run on Tropos https://troposfit.com"
    );
  });
});

describe("a shared post's address (App1 Q51)", () => {
  it("is the post's own path on the production web app", () => {
    // The same path as the in-app route, so the iPhone app opens it as
    // it is, and Hosting sends it to the public page for anyone else.
    expect(publicPostUrl("AbC123")).toBe(
      "https://troposfit.com/activity/AbC123"
    );
  });

  it("ends a public post's card's words", () => {
    expect(withAppLink("My run on Tropos", publicPostUrl("AbC123"))).toBe(
      "My run on Tropos https://troposfit.com/activity/AbC123"
    );
  });

  it("sends people to Tropos on the App Store", () => {
    // Apple ID 6762416918 (docs/app-store/listing.md).
    expect(APP_STORE_URL).toBe("https://apps.apple.com/app/id6762416918");
  });
});
