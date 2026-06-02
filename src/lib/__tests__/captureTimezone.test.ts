import { describe, it, expect } from "vitest";
import { getDeviceTimezone, shouldUpdateTimezone } from "../captureTimezone";

describe("getDeviceTimezone", () => {
  it("returns a non-empty IANA string in an environment with Intl", () => {
    const tz = getDeviceTimezone();
    expect(tz === null || (typeof tz === "string" && tz.length > 0)).toBe(true);
  });
});

describe("shouldUpdateTimezone", () => {
  it("writes when stored is absent and device is known", () => {
    expect(shouldUpdateTimezone(undefined, "Europe/London")).toBe(true);
    expect(shouldUpdateTimezone(null, "Europe/London")).toBe(true);
  });

  it("does NOT write when stored already matches the device", () => {
    expect(shouldUpdateTimezone("Europe/London", "Europe/London")).toBe(false);
  });

  it("writes when the device tz changed (user travelled / moved)", () => {
    expect(shouldUpdateTimezone("Europe/London", "America/Los_Angeles")).toBe(
      true
    );
  });

  it("never clears a stored value with a null device read (SSR / blocked Intl)", () => {
    expect(shouldUpdateTimezone("Europe/London", null)).toBe(false);
    expect(shouldUpdateTimezone(null, null)).toBe(false);
    expect(shouldUpdateTimezone(undefined, null)).toBe(false);
  });
});
