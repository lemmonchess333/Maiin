/**
 * The photo viewer's gesture rules: when a swipe turns the photo, when a
 * pull closes the viewer, and where a pinch or a double tap leaves it.
 */
import { describe, expect, it } from "vitest";
import {
  AXIS_SLOP_PX,
  DOUBLE_TAP_MS,
  DOUBLE_TAP_SCALE,
  EDGE_RESISTANCE,
  MAX_SCALE,
  STALE_SPEED_MS,
  backdropOpacity,
  closeOnRelease,
  doubleTapView,
  dragAxis,
  followX,
  followY,
  isDoubleTap,
  pinchView,
  releaseVelocity,
  settleView,
  turnOnRelease,
} from "../photoGesture";

const STAGE = { width: 400, height: 700 };
const CENTRE = { x: 200, y: 350 };

describe("dragAxis", () => {
  it("waits for the slop, then takes the larger travel", () => {
    expect(dragAxis(AXIS_SLOP_PX - 1, 2)).toBeNull();
    expect(dragAxis(20, 5)).toBe("x");
    expect(dragAxis(-5, 20)).toBe("y");
    expect(dragAxis(-20, -19)).toBe("x");
  });
});

describe("following the finger", () => {
  it("moves with the finger while there is a photo that way", () => {
    expect(followX(-80, 0, 3)).toBe(-80);
    expect(followX(80, 1, 3)).toBe(80);
  });
  it("is held back past the first and the last photo", () => {
    expect(followX(80, 0, 3)).toBe(80 * EDGE_RESISTANCE);
    expect(followX(-80, 2, 3)).toBe(-80 * EDGE_RESISTANCE);
    expect(followX(-80, 0, 1)).toBe(-80 * EDGE_RESISTANCE);
  });
  it("follows a pull down, and holds back a push up", () => {
    expect(followY(120)).toBe(120);
    expect(followY(-120)).toBe(-120 * EDGE_RESISTANCE);
  });
});

describe("turnOnRelease", () => {
  it("turns past a quarter of the stage, slow or not", () => {
    expect(turnOnRelease(-120, 0, 400, 0, 3)).toBe(1);
    expect(turnOnRelease(120, 0, 400, 1, 3)).toBe(-1);
  });
  it("turns on a flick the way it was going", () => {
    expect(turnOnRelease(-40, -0.8, 400, 0, 3)).toBe(1);
    // A flick back against the drag springs home.
    expect(turnOnRelease(-60, 0.8, 400, 1, 3)).toBe(0);
  });
  it("springs back from a short or slow drag, and at the ends", () => {
    expect(turnOnRelease(-20, -2, 400, 0, 3)).toBe(0);
    expect(turnOnRelease(-60, -0.1, 400, 0, 3)).toBe(0);
    expect(turnOnRelease(200, 1, 400, 0, 3)).toBe(0);
    expect(turnOnRelease(-200, -1, 400, 2, 3)).toBe(0);
  });
});

describe("closeOnRelease", () => {
  it("closes on a long pull or a flick down", () => {
    expect(closeOnRelease(120, 0, 700)).toBe(true);
    expect(closeOnRelease(40, 0.9, 700)).toBe(true);
  });
  it("never closes going up, or from a nudge", () => {
    expect(closeOnRelease(-300, -2, 700)).toBe(false);
    expect(closeOnRelease(20, 3, 700)).toBe(false);
    expect(closeOnRelease(60, 0.1, 700)).toBe(false);
  });
});

describe("backdropOpacity", () => {
  it("is dark at rest and fades as the photo is pulled down", () => {
    expect(backdropOpacity(0, 700)).toBe(1);
    expect(backdropOpacity(-50, 700)).toBe(1);
    expect(backdropOpacity(175, 700)).toBeCloseTo(0.65);
    expect(backdropOpacity(1000, 700)).toBe(0.3);
  });
});

describe("pinchView", () => {
  it("keeps the point under the fingers under them as they spread", () => {
    const start = { scale: 1, x: 0, y: 0 };
    const mid = { x: 260, y: 300 };
    const view = pinchView(start, mid, 100, mid, 200, CENTRE);
    expect(view.scale).toBe(2);
    // The photo point that sat under the fingers: (60, -50) from centre.
    expect(CENTRE.x + view.x + view.scale * 60).toBeCloseTo(mid.x);
    expect(CENTRE.y + view.y + view.scale * -50).toBeCloseTo(mid.y);
  });
  it("follows the fingers as they move together", () => {
    const view = pinchView(
      { scale: 2, x: 10, y: 0 },
      { x: 200, y: 350 },
      100,
      { x: 230, y: 360 },
      100,
      CENTRE
    );
    expect(view).toEqual({ scale: 2, x: 40, y: 10 });
  });
  it("gives a little past the floor and the ceiling", () => {
    const at = { x: 200, y: 350 };
    expect(
      pinchView({ scale: 1, x: 0, y: 0 }, at, 100, at, 10, CENTRE).scale
    ).toBe(0.7);
    expect(
      pinchView({ scale: 4, x: 0, y: 0 }, at, 100, at, 400, CENTRE).scale
    ).toBeCloseTo(MAX_SCALE * 1.15);
  });
});

describe("settleView", () => {
  it("comes back to rest at or under scale 1", () => {
    expect(settleView({ scale: 0.8, x: 30, y: 10 }, STAGE)).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    });
  });
  it("comes back under the ceiling", () => {
    expect(settleView({ scale: 6, x: 0, y: 0 }, STAGE).scale).toBe(MAX_SCALE);
  });
  it("keeps a zoomed photo over the middle of the stage", () => {
    // At 2x the photo can move half the stage each way and no further.
    expect(settleView({ scale: 2, x: 500, y: -900 }, STAGE)).toEqual({
      scale: 2,
      x: 200,
      y: -350,
    });
  });
});

describe("double tap", () => {
  it("zooms in to where it landed, and back out", () => {
    const tap = { x: 250, y: 380 };
    const view = doubleTapView({ scale: 1, x: 0, y: 0 }, tap, CENTRE, STAGE);
    expect(view.scale).toBe(DOUBLE_TAP_SCALE);
    // The tapped point stays where it was.
    expect(CENTRE.x + view.x + view.scale * 50).toBeCloseTo(tap.x);
    expect(CENTRE.y + view.y + view.scale * 30).toBeCloseTo(tap.y);
    expect(doubleTapView(view, tap, CENTRE, STAGE)).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    });
  });
  it("is two taps close in time and place", () => {
    const last = { time: 1000, point: { x: 100, y: 100 } };
    expect(isDoubleTap(null, 1100, { x: 100, y: 100 })).toBe(false);
    expect(isDoubleTap(last, 1000 + DOUBLE_TAP_MS, { x: 110, y: 110 })).toBe(
      true
    );
    expect(
      isDoubleTap(last, 1000 + DOUBLE_TAP_MS + 1, { x: 100, y: 100 })
    ).toBe(false);
    expect(isDoubleTap(last, 1100, { x: 160, y: 100 })).toBe(false);
  });
});

describe("releaseVelocity", () => {
  it("is the last two samples' speed", () => {
    expect(releaseVelocity({ t: 0, v: 0 }, { t: 16, v: -16 }, 20)).toBe(-1);
  });
  it("is nothing when the finger stopped before lifting, or never moved", () => {
    expect(
      releaseVelocity({ t: 0, v: 0 }, { t: 16, v: 80 }, 16 + STALE_SPEED_MS + 1)
    ).toBe(0);
    expect(releaseVelocity(null, { t: 16, v: 80 }, 20)).toBe(0);
  });
});
