/**
 * Temperatures as the reader reads them (Run26 (5)). The weather arrives
 * in °C (weather.ts) and is shown in °F only where the device's region
 * reads temperatures in °F (the US, Liberia, Myanmar, the Bahamas, Belize,
 * the Cayman Islands, Palau, Micronesia and the Marshall Islands), and in
 * °C everywhere else. The distance setting plays no part: many runners in
 * the UK read miles and think in °C.
 *
 * The region is the one the locale tag names (`navigator.language`, then
 * `navigator.languages`), and only one it names outright. A bare "en" is
 * not read as the US, as `Intl.Locale.maximize()` would read it: iOS has
 * been seen to send "en" for a UK or Canadian device, and showing °F
 * there is the mistake this rule exists to avoid. With no region named,
 * °C, as the setup strip has always shown.
 *
 * Display only, like distanceUnits.ts: nothing here is stored.
 */
import { MINUS_SIGN } from "@/utils/formatters";

export type TemperatureUnit = "C" | "F";

/** The regions that read temperatures in °F, as ISO 3166 codes. */
const FAHRENHEIT_REGIONS: ReadonlySet<string> = new Set([
  "US",
  "LR",
  "MM",
  "BS",
  "BZ",
  "KY",
  "PW",
  "FM",
  "MH",
]);

/** The region a locale tag names outright ("en-GB" → "GB", "en" → null),
 *  or null for a tag that can't be read. Underscores are read as hyphens
 *  ("en_GB"), which some platforms send. */
function regionOf(tag: string | null | undefined): string | null {
  if (!tag) return null;
  try {
    return new Intl.Locale(tag.replace(/_/g, "-")).region ?? null;
  } catch {
    return null;
  }
}

/** The temperature unit for a list of locale tags, most preferred first:
 *  the first tag that names a region decides, and °C when none does. */
export function temperatureUnitForLocales(
  tags: ReadonlyArray<string | null | undefined>
): TemperatureUnit {
  for (const tag of tags) {
    const region = regionOf(tag);
    if (region) return FAHRENHEIT_REGIONS.has(region.toUpperCase()) ? "F" : "C";
  }
  return "C";
}

/** The temperature unit for this device's region. */
export function deviceTemperatureUnit(): TemperatureUnit {
  if (typeof navigator === "undefined") return "C";
  return temperatureUnitForLocales([
    navigator.language,
    ...(navigator.languages ?? []),
  ]);
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
