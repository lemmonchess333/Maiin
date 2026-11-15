/**
 * The next hours (Run26 (5)), server and client. The server
 * (functions/lib/metWeather.js) reads them from MET Norway's forecast and
 * works out each hour's dew point; the client (src/lib/weather.ts) reads
 * them from the callable's answer, and heatAdjustment.ts sums air and dew
 * point for the heat rule. Neither side's tests see the other, so a
 * recorded MET response is run through the server's reading and then the
 * client's here, and the two dew point formulas are held together.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { asWeatherData } from "@/lib/weather";
import { dewPointC } from "@/lib/heatAdjustment";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/metWeather.js") as {
  weatherAt: (series: unknown[], nowMs: number) => Record<string, unknown>;
  dewPointC: (tempC: number, humidity: number) => number;
  NEXT_HOURS: number;
};
/** MET Norway's compact forecast for Bergen, as updated at 12:28:55 UTC on
 *  7 November 2025 (the functions suite's recorded fixture). */
const recorded =
  require("../../../functions/__tests__/fixtures/metCompactBergen.json") as {
    properties: { meta: { updated_at: string }; timeseries: unknown[] };
  };

describe("the next hours, from MET to the app", () => {
  it("reaches the app as the server read them from a recorded response", () => {
    const now = Date.parse(recorded.properties.meta.updated_at);
    const answer = server.weatherAt(recorded.properties.timeseries, now);
    const hours = answer.hours as {
      time: string;
      temperature: number;
      dewPoint: number;
    }[];
    expect(hours).toHaveLength(server.NEXT_HOURS);
    const weather = asWeatherData(answer);
    expect(weather?.hours).toEqual(
      hours.map((h) => ({
        at: Date.parse(h.time),
        temperature: h.temperature,
        dewPoint: h.dewPoint,
      }))
    );
    // Every hour is ahead of now, an hour apart.
    expect(weather!.hours![0].at).toBe(Date.parse("2025-11-07T13:00:00Z"));
    weather!.hours!.forEach((h, i) =>
      expect(h.at - weather!.hours![0].at).toBe(i * 3_600_000)
    );
  });

  it("works out the dew point by one formula on both sides", () => {
    for (const temperature of [-10, 0, 12.5, 24, 32, 40]) {
      for (const humidity of [0, 5, 30, 50, 70, 91.4, 100, 120]) {
        expect(server.dewPointC(temperature, humidity)).toBeCloseTo(
          dewPointC(temperature, humidity),
          10
        );
      }
    }
  });
});
