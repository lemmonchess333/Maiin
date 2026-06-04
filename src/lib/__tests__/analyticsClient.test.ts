/**
 * Shared analytics adapter — pins the behaviour that every per-surface
 * `track()` wrapper relies on. `emit()` is the one place the analytics
 * backend is wired; these tests pin the contract callers expect: it
 * mirrors to the dev logger AND forwards a redaction-sanitised payload
 * to the provider.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../analyticsProvider", () => ({
  logAnalyticsEvent: vi.fn(),
}));

import { emit } from "../analyticsClient";
import { logger } from "../logger";
import { logAnalyticsEvent } from "../analyticsProvider";

describe("analyticsClient.emit", () => {
  beforeEach(() => {
    vi.mocked(logger.log).mockReset();
    vi.mocked(logger.warn).mockReset();
    vi.mocked(logAnalyticsEvent).mockReset();
  });

  it("forwards the event to logger.log with a [surface] prefix and the metadata", () => {
    emit("home", "home_card_tapped", { card: "performance" });

    expect(logger.log).toHaveBeenCalledWith("[home] home_card_tapped", {
      card: "performance",
    });
  });

  it("forwards to the provider with the surface tagged on and metadata passed through", () => {
    emit("paywall", "checkout_started", { source: "settings" });

    expect(logAnalyticsEvent).toHaveBeenCalledWith("checkout_started", {
      source: "settings",
      surface: "paywall",
    });
  });

  it("redacts PII out of the provider payload but leaves the dev logger raw", () => {
    emit("food", "first_food_logged", {
      mealText: "two eggs",
      source: "manual",
    });

    // Dev logger keeps the raw metadata (local-only, dev-gated).
    expect(logger.log).toHaveBeenCalledWith("[food] first_food_logged", {
      mealText: "two eggs",
      source: "manual",
    });
    // Provider never sees the PII key.
    expect(logAnalyticsEvent).toHaveBeenCalledWith("first_food_logged", {
      source: "manual",
      surface: "food",
    });
  });

  it("swallows logger.log failures and routes them to logger.warn (analytics MUST NOT break the calling flow)", () => {
    /* Every per-surface track() wrapper guards the analytics path
       behind a try/catch — checkout, food save, etc. can't be taken
       down by a flaky analytics provider. emit() owns that guarantee
       now. */
    vi.mocked(logger.log).mockImplementationOnce(() => {
      throw new Error("provider down");
    });

    expect(() =>
      emit("paywall", "checkout_started", { source: "settings" })
    ).not.toThrow();

    expect(logger.warn).toHaveBeenCalledWith("[paywall] track failed", {
      event: "checkout_started",
      err: "Error: provider down",
    });
  });
});
