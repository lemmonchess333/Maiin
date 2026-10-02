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
 *
 * Each unit is a two-way switch that shows both options. They were rows
 * whose value in capitals ("KM") flipped when the row was tapped, with
 * nothing to say it would.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
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
  const toggleDark = vi.fn();
  const toggleHideWeightNumber = vi.fn();
  render(
    <UnitsAppearanceSection
      inline
      profile={makeProfile(overrides)}
      toggleUnit={toggleUnit}
      toggleDark={toggleDark}
      toggleHideWeightNumber={toggleHideWeightNumber}
    />
  );
  return { toggleUnit, toggleDark, toggleHideWeightNumber };
}

/** One option of one of the page's two-way switches. */
function option(group: string, name: string) {
  return within(screen.getByRole("radiogroup", { name: group })).getByRole(
    "radio",
    { name }
  );
}

beforeEach(() => {
  track.mockReset();
  cleanup();
});

describe("distance & pace unit toggle", () => {
  it("shows km chosen for a metric profile and mi for an imperial one", () => {
    renderSection({ preferredDistanceUnit: "km" });
    expect(option("Distance unit", "km")).toHaveAttribute(
      "aria-checked",
      "true"
    );
    cleanup();
    renderSection({ preferredDistanceUnit: "mi" });
    expect(option("Distance unit", "mi")).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("flips the profile field, passing the CURRENT value", () => {
    /* The handler derives the next value from the current one, so passing
       the post-flip value would make the control a no-op that looks like
       it works. */
    const { toggleUnit } = renderSection({ preferredDistanceUnit: "km" });
    fireEvent.click(option("Distance unit", "mi"));
    expect(toggleUnit).toHaveBeenCalledWith("preferredDistanceUnit", "km");
  });

  it("does nothing when the option already chosen is tapped", () => {
    /* The handler flips, so a tap on the chosen option must not reach it:
       tapping "km" while on km would otherwise switch to miles. */
    const { toggleUnit } = renderSection({ preferredDistanceUnit: "km" });
    fireEvent.click(option("Distance unit", "km"));
    expect(toggleUnit).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
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
    renderSection({ preferredDistanceUnit: "km", preferredHeightUnit: "cm" });
    fireEvent.click(option("Distance unit", "mi"));
    expect(track).toHaveBeenCalledWith("settings_toggle_changed", {
      toggle: "run_distance_unit",
      value: "mi",
    });

    track.mockReset();
    fireEvent.click(option("Height unit", "ft"));
    expect(track).toHaveBeenCalledWith("settings_toggle_changed", {
      toggle: "height_unit",
      value: "ft",
    });
  });

  it("reports the value the user PICKED, not the one they left", () => {
    // Matches the convention the sibling toggles document.
    renderSection({ preferredDistanceUnit: "mi" });
    fireEvent.click(option("Distance unit", "km"));
    expect(track).toHaveBeenCalledWith("settings_toggle_changed", {
      toggle: "run_distance_unit",
      value: "km",
    });
  });
});

describe("body weight unit scope", () => {
  it("names the body-weight scope and keeps lifting loads explicit", () => {
    const { toggleUnit } = renderSection({ preferredWeightUnit: "lbs" });
    fireEvent.click(option("Body weight unit", "kg"));
    expect(toggleUnit).toHaveBeenCalledWith("preferredWeightUnit", "lbs");
    expect(screen.getByText("Weigh-ins and goal weight")).toBeInTheDocument();
    expect(
      screen.getByText("Lifting loads are always in kg.")
    ).toBeInTheDocument();
  });
});

describe("appearance", () => {
  it("switches the theme from the option not chosen, and only then", () => {
    const { toggleDark } = renderSection({ darkMode: true });
    fireEvent.click(option("Theme", "Dark"));
    expect(toggleDark).not.toHaveBeenCalled();
    fireEvent.click(option("Theme", "Light"));
    expect(toggleDark).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("settings_toggle_changed", {
      toggle: "theme",
      value: "light",
    });
  });

  it("hides the weight number from its switch", () => {
    const { toggleHideWeightNumber } = renderSection({
      hideWeightNumber: false,
    });
    const control = screen.getByRole("switch", { name: "Hide weight number" });
    expect(control).toHaveAttribute("aria-checked", "false");
    fireEvent.click(control);
    expect(toggleHideWeightNumber).toHaveBeenCalledTimes(1);
  });
});
