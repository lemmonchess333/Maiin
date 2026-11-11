/**
 * The full-screen photo viewer's gestures, as numbers (PostPhotoViewer).
 *
 * One finger on an unzoomed photo is a swipe: sideways turns the photo,
 * downward closes the viewer, and the photo follows the finger either way.
 * Two fingers pinch; a zoomed photo pans under one finger; a double tap
 * zooms in to where it landed, or back out. Apple Photos and Instagram's
 * viewer work this way.
 *
 * Everything here is pure, so the rules are tested without a gesture.
 */

/** Travel, in px, before a finger counts as moving along an axis. */
export const AXIS_SLOP_PX = 8;
/** Below this travel nothing turns or closes, however fast it went. */
export const MIN_FLICK_PX = 30;
/** A flick, in px per ms: fast enough to turn or close from a short drag. */
export const FLICK_PX_PER_MS = 0.4;
/** A finger still for longer than this before lifting has no speed. */
export const STALE_SPEED_MS = 80;
/** Share of the stage's width that turns the photo without a flick. */
export const TURN_SHARE = 0.25;
/** Share of the stage's height that closes the viewer without a flick. */
export const CLOSE_SHARE = 0.15;
/** Resistance past the last photo, and on an upward drag. */
export const EDGE_RESISTANCE = 0.3;

export const MAX_SCALE = 4;
export const DOUBLE_TAP_SCALE = 2.5;
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_PX = 30;

export type Axis = "x" | "y";

/**
 * Which way a one-finger drag is going, once it has gone far enough to
 * tell; null until then.
 */
export function dragAxis(dx: number, dy: number): Axis | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_SLOP_PX) return null;
  return Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
}

/**
 * Where the photo sits under a sideways drag: with the finger while there
 * is a photo that way, and held back past the first and the last.
 */
export function followX(dx: number, index: number, count: number): number {
  const pastEnd = (dx > 0 && index === 0) || (dx < 0 && index >= count - 1);
  return pastEnd ? dx * EDGE_RESISTANCE : dx;
}

/** Downward follows the finger; upward is held back, since up closes nothing. */
export function followY(dy: number): number {
  return dy < 0 ? dy * EDGE_RESISTANCE : dy;
}

/**
 * Whether a released sideways drag turns the photo, and which way:
 * 1 for the next, -1 for the previous, 0 to spring back.
 */
export function turnOnRelease(
  dx: number,
  velocityX: number,
  width: number,
  index: number,
  count: number
): -1 | 0 | 1 {
  const step = dx < 0 ? 1 : -1;
  const target = index + step;
  if (target < 0 || target >= count) return 0;
  if (Math.abs(dx) < MIN_FLICK_PX) return 0;
  const far = Math.abs(dx) >= width * TURN_SHARE;
  const flick =
    Math.abs(velocityX) >= FLICK_PX_PER_MS && Math.sign(velocityX) === -step;
  return far || flick ? step : 0;
}

/** Whether a released downward drag closes the viewer. */
export function closeOnRelease(
  dy: number,
  velocityY: number,
  height: number
): boolean {
  if (dy < MIN_FLICK_PX) return false;
  return dy >= height * CLOSE_SHARE || velocityY >= FLICK_PX_PER_MS;
}

/**
 * How dark the stage stays while the photo is pulled down: fully dark at
 * rest, fading to 0.3 by half the stage's height.
 */
export function backdropOpacity(dy: number, height: number): number {
  if (dy <= 0 || height <= 0) return 1;
  return Math.max(0.3, 1 - (dy / (height / 2)) * 0.7);
}

export interface Point {
  x: number;
  y: number;
}
export interface View {
  scale: number;
  x: number;
  y: number;
}

/**
 * The view under a pinch, keeping the point that was under the fingers
 * at the start under the fingers now. `centre` is the photo's centre on
 * screen at rest; the photo is drawn translated, then scaled about it.
 */
export function pinchView(
  start: View,
  startMid: Point,
  startDistance: number,
  mid: Point,
  distance: number,
  centre: Point
): View {
  const ratio = startDistance > 0 ? distance / startDistance : 1;
  // Under the fingers' full spread, so a pinch out past the floor or
  // past the ceiling still feels held rather than stuck.
  const scale = Math.min(MAX_SCALE * 1.15, Math.max(0.7, start.scale * ratio));
  const localX = (startMid.x - centre.x - start.x) / start.scale;
  const localY = (startMid.y - centre.y - start.y) / start.scale;
  return {
    scale,
    x: mid.x - centre.x - scale * localX,
    y: mid.y - centre.y - scale * localY,
  };
}

/**
 * The view a gesture settles to: scale back inside 1 to MAX_SCALE, and
 * the photo kept covering the middle of the stage, so it can't be lost
 * off one side. At scale 1 it sits centred.
 */
export function settleView(
  view: View,
  stage: { width: number; height: number }
): View {
  const scale = Math.min(MAX_SCALE, Math.max(1, view.scale));
  if (scale <= 1.01) return { scale: 1, x: 0, y: 0 };
  const limitX = ((scale - 1) * stage.width) / 2;
  const limitY = ((scale - 1) * stage.height) / 2;
  return {
    scale,
    x: Math.min(limitX, Math.max(-limitX, view.x)),
    y: Math.min(limitY, Math.max(-limitY, view.y)),
  };
}

/**
 * A double tap's view: in to DOUBLE_TAP_SCALE about where it landed, or
 * back out when already zoomed.
 */
export function doubleTapView(
  current: View,
  tap: Point,
  centre: Point,
  stage: { width: number; height: number }
): View {
  if (current.scale > 1.01) return { scale: 1, x: 0, y: 0 };
  const s = DOUBLE_TAP_SCALE;
  return settleView(
    {
      scale: s,
      x: (tap.x - centre.x) * (1 - s),
      y: (tap.y - centre.y) * (1 - s),
    },
    stage
  );
}

/** Whether a tap follows the last one closely enough to be a double tap. */
export function isDoubleTap(
  last: { time: number; point: Point } | null,
  time: number,
  point: Point
): boolean {
  if (!last) return false;
  return (
    time - last.time <= DOUBLE_TAP_MS &&
    Math.hypot(point.x - last.point.x, point.y - last.point.y) <= DOUBLE_TAP_PX
  );
}

/**
 * Speed from the last two samples, in px per ms, or 0 when the finger
 * stopped before lifting.
 */
export function releaseVelocity(
  previous: { t: number; v: number } | null,
  last: { t: number; v: number },
  now: number
): number {
  if (!previous || now - last.t > STALE_SPEED_MS) return 0;
  const dt = Math.max(8, last.t - previous.t);
  return (last.v - previous.v) / dt;
}
