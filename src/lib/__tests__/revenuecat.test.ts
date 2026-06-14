import { describe, it, expect, vi } from "vitest";

// Web platform (not native) → RevenueCat must be a complete no-op and must
// never dynamically import the native plugin.
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

import {
  isRevenueCatEnabled,
  rcLogIn,
  rcLogOut,
  configureRevenueCat,
} from "../revenuecat";

describe("revenuecat — web/no-key gating (slice 2)", () => {
  it("is disabled on web (no native platform / no key)", () => {
    expect(isRevenueCatEnabled()).toBe(false);
  });

  it("logIn / logOut / configure are safe no-ops when disabled", async () => {
    // Resolve without throwing and without touching the native plugin.
    await expect(configureRevenueCat("uid123")).resolves.toBeUndefined();
    await expect(rcLogIn("uid123")).resolves.toBeUndefined();
    await expect(rcLogOut()).resolves.toBeUndefined();
  });
});
