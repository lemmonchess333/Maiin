// @vitest-environment jsdom
/**
 * The Live Activities switch (Wid2 call 6): Apple asks that a run's and a
 * lift's card outside the app be easy to turn off in the app. On by
 * default; off is kept on this phone and takes every card down at once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const track = vi.fn();
vi.mock("@/lib/settingsAnalytics", () => ({
  track: (...args: unknown[]) => track(...args),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
const endEveryCard = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/liveActivities", () => ({ endEveryCard }));
vi.mock("@/lib/platform", () => ({ isNativePlatform: vi.fn(() => true) }));

import LiveActivitiesGroup from "../LiveActivitiesGroup";
import {
  LIVE_ACTIVITIES_OFF_KEY,
  liveActivitiesOn,
} from "@/lib/liveActivitySetting";
import { readString, remove } from "@/lib/localStore";

beforeEach(() => {
  vi.clearAllMocks();
  remove(LIVE_ACTIVITIES_OFF_KEY);
});
afterEach(cleanup);

describe("the Live Activities switch", () => {
  it("is on until it is turned off", () => {
    render(<LiveActivitiesGroup />);
    expect(screen.getByText("Lock Screen")).toBeTruthy();
    const toggle = screen.getByRole("switch", { name: "Live Activities" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(liveActivitiesOn()).toBe(true);
  });

  it("turns them off on this phone and takes every card down", async () => {
    render(<LiveActivitiesGroup />);
    fireEvent.click(screen.getByRole("switch", { name: "Live Activities" }));
    expect(
      screen
        .getByRole("switch", { name: "Live Activities" })
        .getAttribute("aria-checked")
    ).toBe("false");
    expect(readString(LIVE_ACTIVITIES_OFF_KEY)).toBe("1");
    expect(liveActivitiesOn()).toBe(false);
    await vi.dynamicImportSettled();
    expect(endEveryCard).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledWith("settings_toggle_changed", {
      toggle: "live_activities",
      value: "off",
    });
  });

  it("reads the phone's choice, and turns them on again", async () => {
    render(<LiveActivitiesGroup />);
    fireEvent.click(screen.getByRole("switch", { name: "Live Activities" }));
    cleanup();
    render(<LiveActivitiesGroup />);
    const toggle = screen.getByRole("switch", { name: "Live Activities" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(liveActivitiesOn()).toBe(true);
    expect(readString(LIVE_ACTIVITIES_OFF_KEY)).toBeNull();
    // Only turning them off ends the cards.
    await vi.dynamicImportSettled();
    expect(endEveryCard).toHaveBeenCalledOnce();
  });
});
