// @vitest-environment jsdom
/**
 * Setup counts (owner, 23 November 2026): the welcome and setup's start go
 * to Tropos's own server as a bare step name, once a launch, with nothing
 * read from the phone: no credentials, no referrer, no stored id.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("DEV", false);
  vi.stubEnv("VITE_USE_EMULATORS", "false");
  fetchMock.mockClear();
  Object.defineProperty(navigator, "webdriver", {
    value: false,
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("countSetupStep", () => {
  it("sends the step's name and nothing else, with no credentials", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const { countSetupStep } = await import("../setupCounts");
    countSetupStep("welcome_viewed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toMatch(/\/countSetupStep$/);
    expect(init).toMatchObject({
      method: "POST",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    });
    expect(JSON.parse(init.body as string)).toEqual({ step: "welcome_viewed" });
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    // Nothing stored on the phone is read to send it.
    expect(getItem).not.toHaveBeenCalled();
    getItem.mockRestore();
  });

  it("counts each step once a launch", async () => {
    const { countSetupStep } = await import("../setupCounts");
    countSetupStep("welcome_viewed");
    countSetupStep("welcome_viewed");
    countSetupStep("setup_started");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends nothing from a browser a test harness drives", async () => {
    Object.defineProperty(navigator, "webdriver", {
      value: true,
      configurable: true,
    });
    const { countSetupStep } = await import("../setupCounts");
    countSetupStep("setup_started");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws when the request fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const { countSetupStep } = await import("../setupCounts");
    expect(() => countSetupStep("setup_started")).not.toThrow();
  });
});
