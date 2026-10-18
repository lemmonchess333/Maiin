import { describe, expect, it } from "vitest";
import { nativePushRoute } from "../nativePushRoute";

describe("native notification destinations", () => {
  it("opens Together even if the previous Social URL selected Feed", () => {
    expect(nativePushRoute({ ownerUid: "me", route: "/social" }, "me")).toBe(
      "/social?tab=together"
    );
  });
  it("requires the authenticated recipient, including for old delivered notifications", () => {
    expect(
      nativePushRoute({ ownerUid: "account-a", route: "/social" }, "account-b")
    ).toBeNull();
    expect(nativePushRoute({ route: "/social" }, "me")).toBeNull();
  });
  it.each([
    "https://example.com",
    "//example.com",
    "/social?redirect=https://example.com",
    "javascript:alert(1)",
    "/user/other",
  ])("rejects unreviewed route %s", (route) => {
    expect(nativePushRoute({ ownerUid: "me", route }, "me")).toBeNull();
  });
});
