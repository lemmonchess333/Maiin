/**
 * Tests for the seven per-surface analytics wrapper modules.
 *
 * Each module exports a `track(event, metadata)` function that
 * delegates to `analyticsClient.emit(surface, event, metadata)`.
 * The surfaces are how downstream dashboards key events when a real
 * provider gets wired up (Segment / Mixpanel / Firebase Analytics);
 * mis-keying a surface would scatter events across the wrong
 * dashboards silently.
 *
 * This test mocks `analyticsClient.emit` once and asserts that:
 *   1. Each wrapper passes the documented surface key.
 *   2. The event + metadata pass through unchanged.
 *   3. Calling track() without metadata defaults to {} (not
 *      undefined, which would crash downstream consumers reading
 *      metadata.foo).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { track as trackFood } from "../foodAnalytics";
import { track as trackHome } from "../homeAnalytics";
import { track as trackHistory } from "../historyAnalytics";
import { track as trackPaywall } from "../paywallAnalytics";
import { track as trackProgramme } from "../programmeAnalytics";
import { track as trackSettings } from "../settingsAnalytics";
import { track as trackSocial } from "../socialAnalytics";
import * as analyticsClient from "../analyticsClient";

const emitSpy = vi.spyOn(analyticsClient, "emit").mockImplementation(() => {});

beforeEach(() => emitSpy.mockClear());

describe("analytics wrappers — surface keys", () => {
  it("foodAnalytics uses surface='food'", () => {
    trackFood("food_meal_slot_tapped");
    expect(emitSpy).toHaveBeenCalledWith("food", "food_meal_slot_tapped", {});
  });

  it("homeAnalytics uses surface='home'", () => {
    trackHome("home_card_tapped");
    expect(emitSpy).toHaveBeenCalledWith("home", "home_card_tapped", {});
  });

  it("historyAnalytics uses surface='history'", () => {
    trackHistory("history_range_changed");
    expect(emitSpy).toHaveBeenCalledWith(
      "history",
      "history_range_changed",
      {},
    );
  });

  it("paywallAnalytics uses surface='paywall'", () => {
    trackPaywall("paywall_viewed");
    expect(emitSpy).toHaveBeenCalledWith("paywall", "paywall_viewed", {});
  });

  it("programmeAnalytics uses surface='programme'", () => {
    trackProgramme("programme_section_viewed");
    expect(emitSpy).toHaveBeenCalledWith(
      "programme",
      "programme_section_viewed",
      {},
    );
  });

  it("settingsAnalytics uses surface='settings'", () => {
    trackSettings("settings_section_viewed");
    expect(emitSpy).toHaveBeenCalledWith(
      "settings",
      "settings_section_viewed",
      {},
    );
  });

  it("socialAnalytics uses surface='social'", () => {
    trackSocial("social_tab_selected");
    expect(emitSpy).toHaveBeenCalledWith("social", "social_tab_selected", {});
  });
});

describe("analytics wrappers — metadata pass-through", () => {
  it("forwards metadata unchanged", () => {
    trackFood("food_meal_slot_tapped", { slot: "lunch" });
    expect(emitSpy).toHaveBeenCalledWith("food", "food_meal_slot_tapped", {
      slot: "lunch",
    });
  });

  it("defaults to {} when metadata is omitted", () => {
    /* Downstream consumers (the eventual provider) read
       metadata.fieldName freely; passing undefined would crash with
       'cannot read property of undefined'. The default-{} contract
       prevents that. */
    trackHome("home_section_viewed");
    expect(emitSpy.mock.calls[0][2]).toEqual({});
  });

  it("preserves nested metadata", () => {
    trackProgramme("programme_section_viewed", {
      section: "week_phase_row",
    });
    expect(emitSpy).toHaveBeenCalledWith(
      "programme",
      "programme_section_viewed",
      { section: "week_phase_row" },
    );
  });
});

describe("analytics wrappers — independence", () => {
  it("calling foodAnalytics does not call homeAnalytics", () => {
    /* Defensive: the seven wrappers each have their own track()
       function with a hard-coded surface. A future refactor that
       accidentally shared a track() implementation would surface
       here. */
    trackFood("food_meal_slot_tapped");
    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy.mock.calls[0][0]).toBe("food");
  });
});
