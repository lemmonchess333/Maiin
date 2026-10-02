/**
 * The launch animation's arithmetic, kept out of the component so it can be
 * tested without a layout engine (jsdom measures every box as zero).
 */

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
