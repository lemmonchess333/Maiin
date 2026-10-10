/**
 * The launch animation's arithmetic, kept out of the component so it can be
 * tested without a layout engine (jsdom measures every box as zero).
 */
import { MARK_HEXAGON, MARK_VIEWBOX } from "./brandMark";

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Flight {
  x: number;
  y: number;
  scale: number;
}

/** The move that sets a mark drawn in `from` down exactly on `to`: centre
 *  onto centre, scaled about the centre. Both boxes hold the same viewBox,
 *  so one scale fits both sides. */
export function flightBetween(from: Box, to: Box): Flight {
  return {
    x: to.left + to.width / 2 - (from.left + from.width / 2),
    y: to.top + to.height / 2 - (from.top + from.height / 2),
    scale: to.height / from.height,
  };
}

/** How far along the flight the path's control point sits, across and up.
 *  More of the climb than of the crossing comes first, so the mark leaves
 *  upward, the way the chevron rose, and lands on the diagonal. */
const ARC_ACROSS = 0.2;
const ARC_UP = 0.6;

/**
 * How far along a move is at `t` (0 to 1 of its duration), on a critically
 * damped spring: Apple's spring with no bounce. It starts at once, but
 * from standstill, and slows into its target instead of stopping on it.
 * An ease-in-out (GuideWalk's) idles for its first tenth, which at launch
 * reads as the app hesitating just as it is ready. Scaled to end on
 * exactly 1.
 */
export function springOut(t: number): number {
  const w = 2 * Math.PI;
  const x = (u: number) => 1 - (1 + w * u) * Math.exp(-w * u);
  return x(t) / x(1);
}

/**
 * The flight as transform keyframes, evenly spaced in time with the spring
 * baked in, so the caller plays them linearly (a spring is not a cubic
 * Bézier, and `linear()` easing is newer than the iOS the app supports).
 * Two more things a single tween from rest to `flight` gets wrong:
 *
 *  - the path: a straight line reads as dragged; the centre follows a soft
 *    arc instead (a quadratic Bézier through the ARC control point), and
 *    still ends exactly on the target's centre;
 *  - the zoom: scale tweened linearly spends half the flight losing the
 *    first half of the size and then collapses, because a shrink is seen in
 *    ratios. Interpolated geometrically, it shrinks by the same ratio in
 *    every step, as a mark moving away at a steady speed would.
 *
 * Transform-only, so the browser can run it off the main thread while
 * Home renders underneath.
 */
export function flightFrames(flight: Flight, steps = 30): string[] {
  const cx = flight.x * ARC_ACROSS;
  const cy = flight.y * ARC_UP;
  const frames: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const p = springOut(i / steps);
    const x = 2 * (1 - p) * p * cx + p * p * flight.x;
    const y = 2 * (1 - p) * p * cy + p * p * flight.y;
    const s = flight.scale ** p;
    frames.push(
      `translate(${round(x)}px, ${round(y)}px) scale(${round(s, 5)})`
    );
  }
  return frames;
}

const round = (v: number, places = 2) => {
  const r = Number(v.toFixed(places));
  return Object.is(r, -0) ? 0 : r;
};

/**
 * The hexagon's corner-inset polygon as a CSS clip-path over the mark's
 * box: the rising chevron is cut out only inside it, so the hexagon's
 * rounded rim stays whole while the chevron comes up from low in the
 * mark. Derived from brandMark.ts, so it cannot drift from the mark.
 */
export function hexagonClipPath(): string {
  const [vx, vy, vw, vh] = MARK_VIEWBOX.split(" ").map(Number);
  const points = MARK_HEXAGON.split(" ").map((pair) => {
    const [x, y] = pair.split(",").map(Number);
    return `${percent((x - vx) / vw)} ${percent((y - vy) / vh)}`;
  });
  return `polygon(${points.join(", ")})`;
}

const percent = (share: number) => `${Number((share * 100).toFixed(3))}%`;

/** Whether a box has not moved or resized since the last frame. Home's
 *  header slides up 12 px as the page enters, easing out, so its last
 *  frames move by fractions of a pixel: anything but no movement at all
 *  counts as moving, and the caller wants several still frames running. */
export function settled(prev: Box | null, next: Box): boolean {
  if (!prev) return false;
  return (
    Math.abs(prev.left - next.left) < 0.01 &&
    Math.abs(prev.top - next.top) < 0.01 &&
    Math.abs(prev.height - next.height) < 0.01
  );
}

/** Browsers driven by a test harness report `navigator.webdriver`. The
 *  launch overlay never shows there: it would only sit over the first
 *  frames every spec and capture waits through. public/init.js asks the
 *  same question before it shows index.html's static frame. */
export function isAutomated(nav: Pick<Navigator, "webdriver"> | undefined) {
  return nav?.webdriver === true;
}
