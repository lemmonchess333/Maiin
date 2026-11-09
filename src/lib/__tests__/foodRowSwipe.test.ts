import { describe, it, expect } from "vitest";
import { swipeSettlesOpen } from "../foodRowSwipe";

const OPEN = -52;

describe("swipeSettlesOpen", () => {
  it("closes a slow short drag instead of leaving it part-open", () => {
    expect(swipeSettlesOpen(-40, -50, OPEN)).toBe(false);
  });

  it("opens a slow drag past the threshold", () => {
    expect(swipeSettlesOpen(-70, 0, OPEN)).toBe(true);
  });

  it("opens on a light leftward flick, whatever the distance", () => {
    expect(swipeSettlesOpen(-20, -900, OPEN)).toBe(true);
  });

  it("closes on a rightward flick, whatever the position", () => {
    expect(swipeSettlesOpen(-90, 900, OPEN)).toBe(false);
  });

  it("keeps an open row open when it is nudged further left", () => {
    // Open sits at -96; a nudge to -126 is still open, not closed.
    expect(swipeSettlesOpen(-126, -100, OPEN)).toBe(true);
  });

  it("goes where the row would coast", () => {
    // -45 moving left at 200 px/s coasts to -75: open.
    expect(swipeSettlesOpen(-45, -200, OPEN)).toBe(true);
  });
});
