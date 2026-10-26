import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const purchases = vi.hoisted(() => ({
  configure: vi.fn(),
  logIn: vi.fn(),
  logOut: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));
vi.mock("@revenuecat/purchases-capacitor", () => ({
  Purchases: purchases,
}));
vi.mock("../logger", () => ({
  logger: { log: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_REVENUECAT_IOS_KEY", "appl_test_key");
  purchases.configure.mockReset().mockResolvedValue(undefined);
  purchases.logIn.mockReset().mockResolvedValue(undefined);
  purchases.logOut.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("RevenueCat native account binding", () => {
  it("reports first-configuration failure so the same account can retry", async () => {
    purchases.configure.mockRejectedValueOnce(new Error("SDK unavailable"));
    const { rcLogIn } = await import("../revenuecat");

    await expect(rcLogIn("account-a")).resolves.toBe(false);
    await expect(rcLogIn("account-a")).resolves.toBe(true);
    expect(purchases.configure).toHaveBeenCalledTimes(2);
    expect(purchases.configure).toHaveBeenLastCalledWith({
      apiKey: "appl_test_key",
      appUserID: "account-a",
    });
    expect(purchases.logIn).not.toHaveBeenCalled();
  });

  it("waits until configuration succeeds before reporting the account bound", async () => {
    let finish!: () => void;
    purchases.configure.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      })
    );
    const { rcLogIn } = await import("../revenuecat");
    let settled = false;
    const binding = rcLogIn("account-a").then((result) => {
      settled = true;
      return result;
    });
    await vi.waitFor(() => expect(purchases.configure).toHaveBeenCalledOnce());
    expect(settled).toBe(false);
    finish();
    await expect(binding).resolves.toBe(true);
  });

  it("uses logIn to change accounts after a successful configuration", async () => {
    const { rcLogIn } = await import("../revenuecat");
    await expect(rcLogIn("account-a")).resolves.toBe(true);
    await expect(rcLogIn("account-b")).resolves.toBe(true);
    expect(purchases.configure).toHaveBeenCalledOnce();
    expect(purchases.logIn).toHaveBeenCalledExactlyOnceWith({
      appUserID: "account-b",
    });
  });

  it("allows a failed later account change to retry without configuring again", async () => {
    const { rcLogIn } = await import("../revenuecat");
    await rcLogIn("account-a");
    purchases.logIn.mockRejectedValueOnce(new Error("Connection unavailable"));
    await expect(rcLogIn("account-b")).resolves.toBe(false);
    await expect(rcLogIn("account-b")).resolves.toBe(true);
    expect(purchases.configure).toHaveBeenCalledOnce();
    expect(purchases.logIn).toHaveBeenCalledTimes(2);
  });

  it("remains a no-op when the native key is absent", async () => {
    vi.stubEnv("VITE_REVENUECAT_IOS_KEY", "");
    const { rcLogIn } = await import("../revenuecat");
    await expect(rcLogIn("account-a")).resolves.toBe(true);
    expect(purchases.configure).not.toHaveBeenCalled();
    expect(purchases.logIn).not.toHaveBeenCalled();
  });
});
