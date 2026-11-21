/**
 * Tests for the per-surface analytics wrapper modules.
 *
 * Each module exports a `track(event, metadata)` function that
 * delegates to `analyticsClient.emit(surface, event, metadata)`.
 * The surfaces are how downstream dashboards key events in the wired
 * provider (Firebase Analytics); mis-keying a surface would scatter
 * events across the wrong dashboards silently.
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
import { track as trackLifecycle } from "../lifecycleAnalytics";
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
      {}
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
      {}
    );
  });

  it("settingsAnalytics uses surface='settings'", () => {
    trackSettings("settings_section_viewed");
    expect(emitSpy).toHaveBeenCalledWith(
      "settings",
      "settings_section_viewed",
      {}
    );
  });

  it("socialAnalytics uses surface='social'", () => {
    trackSocial("social_tab_selected");
    expect(emitSpy).toHaveBeenCalledWith("social", "social_tab_selected", {});
  });

  it("lifecycleAnalytics uses surface='lifecycle'", () => {
    trackLifecycle("signup_completed", { method: "email" });
    expect(emitSpy).toHaveBeenCalledWith("lifecycle", "signup_completed", {
      method: "email",
    });
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
      { section: "week_phase_row" }
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

describe("analytics wrappers — a word parameter takes its list, never typed text", () => {
  /* Each of these was a bare `string`, checked by hand to carry a fixed
     vocabulary at every call site. Typed as the vocabulary, a call that
     passes what a person typed (a food, a Circle's title) fails the build:
     `tsc -b` reports any `@ts-expect-error` below that stops erroring. */
  it("refuses a typed name where a list's word goes", () => {
    const typed = "Chicken and rice";
    // @ts-expect-error a pantry food's source is how it was logged
    trackFood("food_pantry_graduated", { source: typed });
    // @ts-expect-error a hint is one of the guide's ids
    trackLifecycle("guide_hint_viewed", { hint: typed });
    // @ts-expect-error a step is one of setup's step ids
    trackLifecycle("onboarding_step_viewed", { step: typed });
    // @ts-expect-error a goal is one of setup's goals
    trackLifecycle("onboarding_completed", { primaryGoal: typed });
    // @ts-expect-error a run mode is one of the plan's modes
    trackLifecycle("onboarding_completed", { runMode: typed });
    // @ts-expect-error a refusal is one of the Watch bridge's reasons
    trackLifecycle("watch_command_answered", { rejection: typed });
    // @ts-expect-error a Circle is reported by its template, never its title
    trackSocial("circle_created", { circleType: typed });
    // The calls themselves still go through: the guard is the type.
    expect(emitSpy).toHaveBeenCalledTimes(7);
  });

  it("takes each list's words", () => {
    trackFood("food_pantry_graduated", { source: "nl", useCount: 2 });
    trackLifecycle("guide_hint_viewed", { hint: "first-set" });
    trackLifecycle("onboarding_step_viewed", { step: "goal", stepIndex: 0 });
    trackLifecycle("watch_command_answered", {
      watchAction: "pause",
      accepted: false,
      rejection: "stale-session",
    });
    trackSocial("circle_created", { circleType: "strength_block" });
    expect(emitSpy).toHaveBeenCalledTimes(5);
  });
});
