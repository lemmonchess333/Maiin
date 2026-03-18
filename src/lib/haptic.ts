/**
 * Trigger device haptic feedback.
 * @param pattern - Duration in ms, array of [vibrate, pause, ...], or named pattern
 */
export function haptic(pattern: number | number[] | 'light' | 'medium' | 'heavy' | 'success' | 'error' = 10) {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    if (pattern === 'light') navigator.vibrate(10);
    else if (pattern === 'medium') navigator.vibrate(25);
    else if (pattern === 'heavy') navigator.vibrate(50);
    else if (pattern === 'success') navigator.vibrate([10, 50, 10]);
    else if (pattern === 'error') navigator.vibrate([50, 30, 50]);
    else navigator.vibrate(pattern);
  } catch {
    // Haptic not supported
  }
}
