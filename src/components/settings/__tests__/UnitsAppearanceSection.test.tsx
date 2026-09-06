/**
 * The distance-unit toggle — the last piece of the miles arc, and the only
 * one a user can see.
 *
 * It shipped last deliberately. The field, the conversion layer and every
 * display surface landed first, across seven changes, because a toggle
 * exposed before them would have handed a user a half-converted app: a
 * distance in miles beside a pace per kilometre, or a spoken cue naming a
 * unit the screen disagreed with. This suite pins what the control does,
 * not how the conversions work — those are pinned where they live.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import UnitsAppearanceSection from "../UnitsAppearanceSection";
import type { UserProfile } from "@/lib/auth";
import { makeProfile } from "@/test/nutritionFixtures";

const track = vi.fn();
vi.mock("@/lib/settingsAnalytics", () => ({
  track: (...args: unknown[]) => track(...args),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

function renderSection(overrides: Partial<UserProfile> = {}) {
  const toggleUnit = vi.fn();
  render(
    <UnitsAppearanceSection
      inline
      profile={makeProfile(overrides)}
      toggleUnit={toggleUnit}
      toggleDark={vi.fn()}
      toggleHideWeightNumber={vi.fn()}
    />
  );
  return { toggleUnit };
}

beforeEach(() => {
  track.mockReset();
  cleanup();
});

describe("distance & pace unit toggle", () => {
  it("reads KM for a metric profile and MILES for an imperial one", () => {
    renderSection({ preferredDistanceUnit: "km" });
    expect(screen.getByText("KM")).toBeTruthy();
    cleanup();
    renderSection({ preferredDistanceUnit: "mi" });
    expect(screen.getByText("MILES")).toBeTruthy();
  });

  it("flips the profile field, passing the CURRENT value", () => {
    /* The handler derives the next value from the current one, so passing
       the post-flip value would make the control a no-op that looks like
       it works. */
    const { toggleUnit } = renderSection({ preferredDistanceUnit: "km" });
    fireEvent.click(screen.getByText("Distance & pace"));
    expect(toggleUnit).toHaveBeenCalledWith("preferredDistanceUnit", "km");
  });

  it("names what it actually changes", () => {
    /* "Distance & pace" rather than "Distance": the pace converts the
       opposite way and is the half a user is most likely to be surprised
       by. The sub-line names the rest — splits, elevation, spoken cues —
       because those all move too, and a user who flips this should not
       have to discover that mid-run. */
    renderSection();
    expect(screen.getByText("Distance & pace")).toBeTruthy();
    expect(
      screen.getByText("Runs, splits, elevation and spoken cues")
    ).toBeTruthy();
  });

  it("reports itself distinctly from the HEIGHT toggle", () => {
    /* Height emitted `distance_unit` from the day it was written. Harmless
       while nothing else could claim the name — but a real distance
       toggle can, and two controls sharing one telemetry key is a
       dashboard that quietly averages them together. */
    renderSection({ preferredDistanceUnit: "km" });
    fireEvent.click(screen.getByText("Distance & pace"));
    expect(track).toHaveBeenCalledWith("settings_toggle_changed", {
      toggle: "run_distance_unit",
      value: "mi",
    });

    track.mockReset();
    fireEvent.click(screen.getByText("Height Unit"));
    expect(track).toHaveBeenCalledWith("settings_toggle_changed", {
      toggle: "height_unit",
      value: "ft",
    });
  });

  it("reports the value the user PICKED, not the one they left", () => {
    // Matches the convention the sibling toggles document.
    renderSection({ preferredDistanceUnit: "mi" });
    fireEvent.click(screen.getByText("Distance & pace"));
    expect(track).toHaveBeenCalledWith("settings_toggle_changed", {
      toggle: "run_distance_unit",
      value: "km",
    });
  });
});

describe("body weight unit scope", () => {
  it("names the body-weight scope and keeps lifting loads explicit", () => {
    const { toggleUnit } = renderSection({ preferredWeightUnit: "lbs" });
    fireEvent.click(screen.getByRole("button", { name: /Body weight unit/ }));
    expect(toggleUnit).toHaveBeenCalledWith("preferredWeightUnit", "lbs");
    expect(screen.getByText(/Lifting loads use kg/)).toBeInTheDocument();
  });
});
