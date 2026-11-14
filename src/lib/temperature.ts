/**
 * Temperatures as the runner reads them (Run26 (5)). The weather arrives
 * in °C (weather.ts) and is shown in the unit that follows the runner's
 * units setting: °F for a runner who reads miles, °C for one who reads
 * kilometres. The app has no temperature setting of its own, so the
 * distance setting stands for it. A Tropos decision: a runner who reads
 * miles and thinks in °C, as many in the UK do, would need a setting of
 * its own.
 *
 * Display only, like distanceUnits.ts: nothing here is stored.
 */
import type { DistanceUnit } from "./distanceUnits";
import { MINUS_SIGN } from "@/utils/formatters";

export type TemperatureUnit = "C" | "F";

/** The temperature unit for a runner's distance unit. */
export function temperatureUnitFor(distance: DistanceUnit): TemperatureUnit {
  return distance === "mi" ? "F" : "C";
}

/** A temperature in °C as the reader reads it, to the whole degree and
 *  spaced as the app's other units are: "14 °C", "57 °F", "−3 °C" (the
 *  true minus). */
export function temperatureLabel(
  celsius: number,
  unit: TemperatureUnit
): string {
  const degrees = Math.round(unit === "F" ? celsius * 1.8 + 32 : celsius);
  const figure = degrees < 0 ? `${MINUS_SIGN}${-degrees}` : `${degrees}`;
  return `${figure} °${unit}`;
}
