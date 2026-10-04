/**
 * MET Norway's weather symbols, server and client.
 *
 * The server (functions/lib/metWeather.js) turns MET's symbol into a WMO
 * weather code; the client (src/lib/weather.ts) turns that code into the
 * strip's icon and the pre-run tips. Neither side's tests see the other:
 * a code the client does not know draws a sun over snow and silences the
 * snow tip, and both suites stay green. So every symbol MET documents, in
 * every variant, is run through the server's mapping and then the
 * client's icon and tips here.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  asWeatherData,
  getRunningTip,
  getWeatherIcon,
  type WeatherData,
} from "@/lib/weather";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/metWeather.js") as {
  SYMBOLS: Record<string, [number, string]>;
  conditionFor: (
    symbol: string
  ) => { weatherCode: number; description: string } | null;
  currentConditions: (series: unknown[], nowMs: number) => unknown;
};

const VARIANTS = ["", "_day", "_night", "_polartwilight"];
const SYMBOLS = Object.keys(server.SYMBOLS);

/** The icon a symbol's words call for. */
function expectedIcon(symbol: string): string {
  if (symbol.includes("thunder")) return "cloud-lightning";
  if (symbol.includes("snow")) return "cloud-snow";
  if (symbol.includes("rain") || symbol.includes("sleet")) return "cloud-rain";
  if (symbol === "fog") return "cloud-fog";
  if (symbol === "clearsky" || symbol === "fair") return "sun";
  if (symbol === "partlycloudy") return "cloud-sun";
  if (symbol === "cloudy") return "cloud";
  throw new Error(`no expectation for ${symbol}`);
}

/** Mild, still and dry, so any tip that fires is the weather's. */
function weatherFor(weatherCode: number): WeatherData {
  return {
    temperature: 14,
    feelsLike: 14,
    humidity: 50,
    windSpeed: 5,
    weatherCode,
    description: "",
  };
}

describe("every MET symbol reaches the strip as the weather it names", () => {
  it("has the symbols to check", () => {
    expect(SYMBOLS).toHaveLength(41);
  });

  it.each(SYMBOLS)("%s draws its own icon, in every variant", (symbol) => {
    for (const variant of VARIANTS) {
      const condition = server.conditionFor(`${symbol}${variant}`);
      expect(condition, `${symbol}${variant}`).not.toBeNull();
      expect(getWeatherIcon(condition!.weatherCode)).toBe(expectedIcon(symbol));
    }
  });

  it.each(SYMBOLS.filter((s) => s.includes("thunder")))(
    "%s gets the thunderstorm tip",
    (symbol) => {
      const { weatherCode } = server.conditionFor(symbol)!;
      expect(getRunningTip(weatherFor(weatherCode))).toMatch(/thunderstorm/i);
    }
  );

  it.each(SYMBOLS.filter((s) => s.includes("snow") && !s.includes("thunder")))(
    "%s gets the snow tip",
    (symbol) => {
      const { weatherCode } = server.conditionFor(symbol)!;
      expect(getRunningTip(weatherFor(weatherCode))).toMatch(/snowy/i);
    }
  );

  it.each(
    SYMBOLS.filter(
      (s) =>
        (s.includes("rain") || s.includes("sleet")) &&
        !s.includes("showers") &&
        !s.includes("thunder")
    )
  )("%s gets the rain tip", (symbol) => {
    const { weatherCode } = server.conditionFor(symbol)!;
    expect(getRunningTip(weatherFor(weatherCode))).toMatch(/rainy/i);
    expect(getRunningTip(weatherFor(weatherCode), "intervals")).toMatch(
      /wet track/i
    );
  });
});

describe("the server's answer has the client's shape", () => {
  it("passes the strip's guard field for field", () => {
    const now = Date.parse("2026-10-04T10:20:00Z");
    const answer = server.currentConditions(
      [
        {
          time: "2026-10-04T10:00:00Z",
          data: {
            instant: {
              details: {
                air_temperature: 8.6,
                relative_humidity: 77,
                wind_speed: 5.5,
              },
            },
            next_1_hours: { summary: { symbol_code: "sleetshowers_day" } },
          },
        },
      ],
      now
    );
    const parsed = asWeatherData(answer);
    expect(parsed).not.toBeNull();
    // Nothing the server sends is dropped, and nothing is missing.
    expect(parsed).toEqual(answer);
    expect(parsed!.description).toBe("Sleet showers");
  });
});
