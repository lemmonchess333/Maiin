/**
 * A widget's tap opens the page it names, and an address from outside
 * opens nothing else: it is untrusted input, as an invite link is.
 */
import { describe, expect, it } from "vitest";
import { widgetRoute, widgetUrl } from "../widgetLinks";
import { nativeInviteCode } from "../nativeInviteLinks";

describe("the address a widget opens", () => {
  it("is the app's own path on its origin, marked as a widget's", () => {
    expect(widgetUrl("/program?day=2")).toBe(
      "https://troposfit.com/program?day=2&from=widget"
    );
    expect(widgetUrl("/")).toBe("https://troposfit.com/?from=widget");
  });

  it("opens the route it was made from", () => {
    for (const path of [
      "/",
      "/food",
      "/program",
      "/program?day=2",
      "/program?tab=run&rday=2026-11-12",
    ])
      expect(widgetRoute(widgetUrl(path))).toBe(path);
  });

  it("is never read as an invite, nor an invite as a widget's", () => {
    expect(nativeInviteCode(widgetUrl("/"))).toBeNull();
    expect(widgetRoute("https://troposfit.com/?invite=ABC123")).toBeNull();
  });
});

describe("an address that is not a widget's opens nothing", () => {
  it.each([
    ["no widget mark", "https://troposfit.com/program?day=2"],
    ["another origin", "https://example.com/program?from=widget"],
    ["another scheme", "tropos://program?from=widget"],
    ["a path no widget writes", "https://troposfit.com/settings?from=widget"],
    [
      "starting a run",
      "https://troposfit.com/run?template=easy_30&startOnArrival=1&from=widget",
    ],
    [
      "a parameter the path does not take",
      "https://troposfit.com/food?day=2&from=widget",
    ],
    ["a malformed day", "https://troposfit.com/program?day=two&from=widget"],
    [
      "a malformed date",
      "https://troposfit.com/program?rday=12/11&from=widget",
    ],
    [
      "a repeated parameter",
      "https://troposfit.com/program?day=1&day=2&from=widget",
    ],
    ["two marks", "https://troposfit.com/?from=widget&from=widget"],
    ["credentials", "https://a:b@troposfit.com/?from=widget"],
    ["a fragment", "https://troposfit.com/?from=widget#x"],
  ])("%s", (_name, url) => {
    expect(widgetRoute(url)).toBeNull();
  });

  it("nor does anything that is not an address", () => {
    expect(widgetRoute(undefined)).toBeNull();
    expect(widgetRoute(42)).toBeNull();
    expect(widgetRoute("not a url")).toBeNull();
    expect(
      widgetRoute(`https://troposfit.com/?from=widget&${"x".repeat(600)}`)
    ).toBeNull();
  });
});
