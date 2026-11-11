import type { GPSPoint } from "./gps";

/** A stale fix or an uncertain speed is no evidence that a runner stopped.
 * Allow two missed one-second fixes, never the whole five-second stop window.
 * Accuracy matches the normal tracking gate after acquisition (35 m). */
export function runMotionState(
  point: GPSPoint | null,
  now: number
): "stationary" | "moving" | "unknown" {
  if (
    !point ||
    !Number.isFinite(point.timestamp) ||
    now - point.timestamp < 0 ||
    now - point.timestamp > 2500 ||
    !Number.isFinite(point.accuracy) ||
    point.accuracy < 0 ||
    point.accuracy > 35 ||
    point.speed === null ||
    !Number.isFinite(point.speed) ||
    point.speed < 0
  )
    return "unknown";
  if (point.speed < 0.5) return "stationary";
  return point.speed >= 1 ? "moving" : "unknown";
}
