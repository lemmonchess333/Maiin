import { FLIGHT_WHEEL_HOLD_MS } from "@/lib/foodFlight";

/**
 * How long the Food page takes to show a log: the calorie wheel's arc,
 * its number and the three macros all finish at this, and the light
 * haptic lands as they do.
 */
export const LOG_MOMENT_MS = 600;

/**
 * How long the wheel's arc takes to grow and its number to count. On a
 * log the wheel first waits for the food's flight to reach it
 * (`FLIGHT_WHEEL_HOLD_MS`), so the two together are the log moment.
 */
export const WHEEL_GROW_MS = LOG_MOMENT_MS - FLIGHT_WHEEL_HOLD_MS;
