/**
 * Shared analytics adapter — pins the behaviour that every per-surface
 * `track()` wrapper relies on. When a real provider (Segment, Mixpanel,
 * Firebase Analytics, etc.) is wired in, `emit()` is the one place that
 * changes; these tests pin the contract callers expect.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { emit } from "../analyticsClient";
import { logger } from "../logger";

describe("analyticsClient.emit", () => {
  beforeEach(() => {
    vi.mocked(logger.log).mockReset();
    vi.mocked(logger.warn).mockReset();
  });

  it("forwards the event to logger.log with a [surface] prefix and the metadata", () => {
    emit("home", "home_card_tapped", { card: "performance" });

    expect(logger.log).toHaveBeenCalledWith(
      "[home] home_card_tapped",
      { card: "performance" },
    );
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
      emit("paywall", "checkout_started", { source: "settings" }),
    ).not.toThrow();

    expect(logger.warn).toHaveBeenCalledWith(
      "[paywall] track failed",
      { event: "checkout_started", err: "Error: provider down" },
    );
  });
});
