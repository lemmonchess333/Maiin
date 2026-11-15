/**
 * MET Norway weather, the pure half (lib/metWeather.js): the symbol
 * mapping the app's tips read, feels-like, the hour that counts as now,
 * the next hours (Run26 (5)), and the per-place cache that keeps MET's
 * terms (Expires, If-Modified-Since, a User-Agent, no more than two
 * decimals sent).
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  MET_USER_AGENT,
  MIN_CACHE_MS,
  NEXT_HOURS,
  SYMBOLS,
  WeatherError,
  validateCoords,
  conditionFor,
  feelsLikeC,
  windChillC,
  heatIndexC,
  currentConditions,
  nextHours,
  weatherAt,
  cacheUntil,
  createWeatherService,
} = require("../lib/metWeather");

/**
 * A recorded compact response: what MET Norway's Locationforecast 2.0
 * served for Bergen (60.39, 5.32) as updated at 12:28:55 UTC on
 * 7 November 2025, 86 time steps, hourly for 60 hours and six-hourly
 * after. Kept whole as saved (its keys sorted by whoever saved it);
 * taken from a public project's test data (the file yr.example.json in
 * echo-webkom/echo-web-mono on GitHub), because this build's network
 * cannot reach api.met.no. MET Norway's data, CC BY 4.0.
 */
const RECORDED = require("./fixtures/metCompactBergen.json");
const RECORDED_AT = Date.parse(RECORDED.properties.meta.updated_at);

const NOW = Date.parse("2026-10-04T10:20:00Z");
const MINUTE = 60_000;

function hour(time, overrides = {}) {
  const {
    temp = 12.3,
    rh = 81.2,
    wind = 4.2,
    symbol = "partlycloudy_day",
    period = "next_1_hours",
  } = overrides;
  return {
    time,
    data: {
      instant: {
        details: {
          air_temperature: temp,
          relative_humidity: rh,
          wind_speed: wind,
        },
      },
      [period]: { summary: { symbol_code: symbol }, details: {} },
    },
  };
}

/** Today's hours around NOW, as MET's compact feed lists them. */
function series(overrides = {}) {
  return [
    hour("2026-10-04T10:00:00Z", overrides),
    hour("2026-10-04T11:00:00Z", { ...overrides, temp: 14 }),
    hour("2026-10-04T12:00:00Z", { ...overrides, temp: 15 }),
  ];
}

function metResponse({ status = 200, timeseries = series(), headers = {} }) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    json: async () => ({
      type: "Feature",
      properties: { meta: {}, timeseries },
    }),
  };
}

describe("the symbol mapping", () => {
  it("covers all 41 of MET's weather symbols", () => {
    // The weathericon legend, base names only.
    expect(Object.keys(SYMBOLS)).toHaveLength(41);
  });

  it("reads a variant as its symbol", () => {
    for (const variant of ["_day", "_night", "_polartwilight"]) {
      expect(conditionFor(`clearsky${variant}`)).toEqual({
        weatherCode: 0,
        description: "Clear sky",
      });
    }
  });

  it("maps rain and sleet to the codes the rain tip reads", () => {
    expect(conditionFor("lightrain").weatherCode).toBe(61);
    expect(conditionFor("rain").weatherCode).toBe(63);
    expect(conditionFor("heavyrain").weatherCode).toBe(65);
    expect(conditionFor("sleet")).toEqual({
      weatherCode: 63,
      description: "Sleet",
    });
  });

  it("maps showers to the WMO shower codes", () => {
    expect(conditionFor("lightrainshowers_day").weatherCode).toBe(80);
    expect(conditionFor("rainshowers_night").weatherCode).toBe(81);
    expect(conditionFor("heavysleetshowers_day").weatherCode).toBe(82);
  });

  it("maps snow and snow showers to the snow codes", () => {
    expect(conditionFor("lightsnow").weatherCode).toBe(71);
    expect(conditionFor("snowshowers_day").weatherCode).toBe(73);
    expect(conditionFor("heavysnowshowers_night").weatherCode).toBe(75);
  });

  it("maps anything with thunder to the thunderstorm code", () => {
    for (const symbol of Object.keys(SYMBOLS).filter((s) =>
      s.includes("thunder")
    )) {
      expect(conditionFor(symbol).weatherCode).toBe(95);
    }
    // MET's own spelling of two of them.
    expect(conditionFor("lightssleetshowersandthunder_day").weatherCode).toBe(
      95
    );
  });

  it("describes in MET's words, sentence case", () => {
    expect(conditionFor("partlycloudy_day").description).toBe("Partly cloudy");
    expect(conditionFor("heavysnowandthunder").description).toBe(
      "Heavy snow and thunder"
    );
  });

  it("reads a symbol MET adds later by its words, and refuses one it cannot", () => {
    expect(conditionFor("freezingrain")).toEqual({
      weatherCode: 63,
      description: "Rain",
    });
    expect(conditionFor("blowingsnow_day").weatherCode).toBe(73);
    expect(conditionFor("dust")).toBeNull();
    expect(conditionFor("")).toBeNull();
    expect(conditionFor(undefined)).toBeNull();
  });
});

describe("feels-like", () => {
  it("is the air temperature where neither wind chill nor heat applies", () => {
    expect(feelsLikeC(15, 20, 80)).toBe(15);
    // 10 °C in a breeze under 4.8 km/h: no chill.
    expect(feelsLikeC(10, 4, 50)).toBe(10);
  });

  it("is the wind chill when it is cold and windy", () => {
    // Environment Canada's table: −10 °C in a 20 km/h wind feels like −18.
    expect(Math.round(windChillC(-10, 20))).toBe(-18);
    expect(Math.round(feelsLikeC(-10, 20, 50))).toBe(-18);
  });

  it("is the heat index when it is hot", () => {
    // The NWS table: 90 °F at 70% humidity feels like 106 °F (41.1 °C).
    const t = ((90 - 32) * 5) / 9;
    expect(heatIndexC(t, 70)).toBeCloseTo(41.1, 0);
    expect(feelsLikeC(t, 10, 70)).toBeGreaterThan(t);
  });
});

describe("currentConditions", () => {
  it("reads the hour nearest now into the app's WeatherData", () => {
    expect(currentConditions(series(), NOW)).toEqual({
      temperature: 12,
      feelsLike: 12,
      humidity: 81,
      // 4.2 m/s is 15.1 km/h: the app's tips are written in km/h.
      windSpeed: 15,
      weatherCode: 2,
      description: "Partly cloudy",
    });
  });

  it("moves to the next hour once it is nearer", () => {
    const at = Date.parse("2026-10-04T10:45:00Z");
    expect(currentConditions(series(), at).temperature).toBe(14);
  });

  it("falls back to the six-hour symbol where no one-hour symbol is given", () => {
    const later = [
      hour("2026-10-04T10:00:00Z", { symbol: "rain", period: "next_6_hours" }),
    ];
    expect(currentConditions(later, NOW).weatherCode).toBe(63);
  });

  it("gives null when no hour is near now, or the hour lacks a value", () => {
    expect(
      currentConditions(series(), Date.parse("2026-10-05T10:00:00Z"))
    ).toBeNull();
    const noWind = [hour("2026-10-04T10:00:00Z")];
    delete noWind[0].data.instant.details.wind_speed;
    expect(currentConditions(noWind, NOW)).toBeNull();
    const unknownSymbol = [hour("2026-10-04T10:00:00Z", { symbol: "dust" })];
    expect(currentConditions(unknownSymbol, NOW)).toBeNull();
    expect(currentConditions(undefined, NOW)).toBeNull();
  });
});

describe("the next hours (Run26 (5))", () => {
  it("reads the recorded response's next twelve hours, temperature and dew point", () => {
    const series = RECORDED.properties.timeseries;
    expect(series).toHaveLength(86);
    // 12:28:55 UTC: the 12:00 step is now, and 13:00 the first hour ahead.
    expect(weatherAt(series, RECORDED_AT)).toEqual({
      temperature: 13,
      feelsLike: 13,
      humidity: 90,
      // 2.5 m/s.
      windSpeed: 9,
      weatherCode: 3,
      description: "Cloudy",
      // Air temperature as MET gives it; the compact product has no dew
      // point, so it is worked out from the humidity: 12.5 °C at 91.4% is
      // a dew point of 11.1 °C.
      hours: [
        ["2025-11-07T13:00:00.000Z", 12.5, 11.1],
        ["2025-11-07T14:00:00.000Z", 11.9, 10.6],
        ["2025-11-07T15:00:00.000Z", 11.3, 10.1],
        ["2025-11-07T16:00:00.000Z", 10, 9.3],
        ["2025-11-07T17:00:00.000Z", 9.5, 9],
        ["2025-11-07T18:00:00.000Z", 10.3, 9.8],
        ["2025-11-07T19:00:00.000Z", 10.4, 9.7],
        ["2025-11-07T20:00:00.000Z", 10.5, 9.7],
        ["2025-11-07T21:00:00.000Z", 10.3, 9.2],
        ["2025-11-07T22:00:00.000Z", 10.2, 9],
        ["2025-11-07T23:00:00.000Z", 10.6, 9],
        ["2025-11-08T00:00:00.000Z", 10.7, 9],
      ].map(([time, temperature, dewPoint]) => ({
        time,
        temperature,
        dewPoint,
      })),
    });
    expect(NEXT_HOURS).toBe(12);
  });

  it("takes MET's own dew point where the response has one", () => {
    const series = [
      hour("2026-10-04T11:00:00Z", { temp: 24.04, rh: 50 }),
      hour("2026-10-04T12:00:00Z", { temp: 26, rh: 50 }),
    ];
    // complete.json's field, where 26 °C at 50% would work out at 14.8.
    series[1].data.instant.details.dew_point_temperature = 15.26;
    expect(nextHours(series, NOW)).toEqual([
      // 24.04 °C at 50%: 13 °C, worked out.
      { time: "2026-10-04T11:00:00.000Z", temperature: 24, dewPoint: 13 },
      { time: "2026-10-04T12:00:00.000Z", temperature: 26, dewPoint: 15.3 },
    ]);
  });

  it("keeps only hours ahead of now, none past twelve hours, at most twelve", () => {
    const series = RECORDED.properties.timeseries;
    // Half past one: 13:00 is behind, 14:00 is the first hour ahead.
    const later = Date.parse("2025-11-07T13:30:00Z");
    const hours = nextHours(series, later);
    expect(hours).toHaveLength(12);
    expect(hours[0].time).toBe("2025-11-07T14:00:00.000Z");
    expect(hours[11].time).toBe("2025-11-08T01:00:00.000Z");
    // Two days on the steps are six-hourly: an hour twelve hours off is
    // the last one taken, whatever the step.
    const sixHourly = Date.parse("2025-11-10T00:00:00Z");
    expect(nextHours(series, sixHourly).map((h) => h.time)).toEqual([
      "2025-11-10T06:00:00.000Z",
      "2025-11-10T12:00:00.000Z",
    ]);
  });

  it("leaves out an hour without its temperature or its humidity", () => {
    const series = [
      hour("2026-10-04T11:00:00Z"),
      hour("2026-10-04T12:00:00Z"),
      hour("2026-10-04T13:00:00Z"),
    ];
    delete series[0].data.instant.details.air_temperature;
    delete series[1].data.instant.details.relative_humidity;
    expect(nextHours(series, NOW).map((h) => h.time)).toEqual([
      "2026-10-04T13:00:00.000Z",
    ]);
    expect(nextHours(undefined, NOW)).toEqual([]);
  });
});

describe("coordinates", () => {
  it("rounds to two decimal places", () => {
    expect(validateCoords(51.507351, -0.127758)).toEqual({
      lat: 51.51,
      lon: -0.13,
    });
  });

  it("refuses anything that is not a place", () => {
    for (const [lat, lon] of [
      [91, 0],
      [0, -181],
      ["51.5", 0],
      [NaN, 0],
      [undefined, undefined],
    ]) {
      expect(() => validateCoords(lat, lon)).toThrow(WeatherError);
    }
  });
});

describe("cacheUntil", () => {
  it("keeps a forecast until MET's Expires time", () => {
    const expires = new Date(NOW + 45 * MINUTE).toUTCString();
    // toUTCString drops the milliseconds NOW does not have.
    expect(cacheUntil(expires, NOW)).toBe(NOW + 45 * MINUTE);
  });

  it("keeps it ten minutes at least", () => {
    const soon = new Date(NOW + 2 * MINUTE).toUTCString();
    expect(cacheUntil(soon, NOW)).toBe(NOW + MIN_CACHE_MS);
    expect(cacheUntil(null, NOW)).toBe(NOW + MIN_CACHE_MS);
    expect(cacheUntil("not a date", NOW)).toBe(NOW + MIN_CACHE_MS);
  });
});

describe("the weather service", () => {
  function setup({ responses = [], maxCells } = {}) {
    let clock = NOW;
    const fetchImpl = vi.fn(async () => {
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next ?? metResponse({});
    });
    const service = createWeatherService({
      fetchImpl,
      now: () => clock,
      ...(maxCells ? { maxCells } : {}),
    });
    return {
      fetchImpl,
      service,
      advance(ms) {
        clock += ms;
      },
    };
  }

  it("asks MET for the rounded place, as Tropos", async () => {
    const { fetchImpl, service } = setup();
    const weather = await service.currentWeather(51.507351, -0.127758);
    expect(weather.description).toBe("Partly cloudy");
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=51.51&lon=-0.13"
    );
    expect(init.headers["User-Agent"]).toBe(MET_USER_AGENT);
    expect(MET_USER_AGENT).toMatch(/^Tropos\/\S+ support@troposfit\.com$/);
    // No full-precision coordinate leaves the server.
    expect(url).not.toContain("51.507");
  });

  it("serves a place from the cache for ten minutes at least", async () => {
    const { fetchImpl, service, advance } = setup({
      responses: [
        metResponse({
          headers: { expires: new Date(NOW + 2 * MINUTE).toUTCString() },
        }),
      ],
    });
    await service.currentWeather(51.5, -0.13);
    advance(9 * MINUTE);
    await service.currentWeather(51.5, -0.13);
    // A nearby point in the same rounded cell is the same place.
    await service.currentWeather(51.501, -0.129);
    expect(fetchImpl).toHaveBeenCalledOnce();
    advance(2 * MINUTE);
    await service.currentWeather(51.5, -0.13);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("honours Expires, then asks again with If-Modified-Since and keeps the forecast on a 304", async () => {
    const lastModified = new Date(NOW - 30 * MINUTE).toUTCString();
    const { fetchImpl, service, advance } = setup({
      responses: [
        metResponse({
          headers: {
            expires: new Date(NOW + 40 * MINUTE).toUTCString(),
            "last-modified": lastModified,
          },
        }),
        {
          status: 304,
          ok: false,
          headers: new Headers({
            expires: new Date(NOW + 90 * MINUTE).toUTCString(),
          }),
          json: async () => {
            throw new Error("a 304 has no body");
          },
        },
      ],
    });
    await service.currentWeather(51.5, -0.13);
    advance(30 * MINUTE);
    await service.currentWeather(51.5, -0.13);
    expect(fetchImpl).toHaveBeenCalledOnce();

    advance(11 * MINUTE);
    const weather = await service.currentWeather(51.5, -0.13);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][1].headers["If-Modified-Since"]).toBe(
      lastModified
    );
    // 11:01 — the held forecast, read for the hour that is now nearest.
    expect(weather.temperature).toBe(14);
    // The 304's Expires now holds the place.
    advance(30 * MINUTE);
    await service.currentWeather(51.5, -0.13);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("answers with the next hours, and a held forecast still has twelve ahead", async () => {
    const recorded = () => ({
      status: 200,
      ok: true,
      headers: new Headers({
        expires: new Date(RECORDED_AT + 3 * 60 * MINUTE).toUTCString(),
      }),
      json: async () => RECORDED,
    });
    let clock = RECORDED_AT;
    const fetchImpl = vi.fn(async () => recorded());
    const service = createWeatherService({ fetchImpl, now: () => clock });
    const first = await service.currentWeather(60.39, 5.32);
    expect(first.hours).toHaveLength(12);
    expect(first.hours[0].time).toBe("2025-11-07T13:00:00.000Z");
    // Two hours on, still inside MET's Expires: the held forecast, with
    // the twelve hours after the new now.
    clock += 2 * 60 * MINUTE;
    const held = await service.currentWeather(60.39, 5.32);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(held.hours).toHaveLength(12);
    expect(held.hours[0].time).toBe("2025-11-07T15:00:00.000Z");
    expect(held.hours[11].time).toBe("2025-11-08T02:00:00.000Z");
  });

  it("serves the last forecast when MET fails and it still covers now", async () => {
    const { service, advance } = setup({
      responses: [metResponse({}), new Error("socket hang up")],
    });
    await service.currentWeather(51.5, -0.13);
    advance(15 * MINUTE);
    const weather = await service.currentWeather(51.5, -0.13);
    // 10:35: the held forecast's 11:00 hour.
    expect(weather.temperature).toBe(14);
  });

  it("fails as provider-unavailable when MET fails with nothing held", async () => {
    const { service } = setup({
      responses: [metResponse({ status: 500 })],
    });
    await expect(service.currentWeather(51.5, -0.13)).rejects.toMatchObject({
      name: "WeatherError",
      code: "provider-unavailable",
      status: 500,
    });
  });

  it("shares one fetch between requests for a place already being fetched", async () => {
    const { fetchImpl, service } = setup();
    const [a, b] = await Promise.all([
      service.currentWeather(51.5, -0.13),
      service.currentWeather(51.5, -0.13),
    ]);
    expect(a).toEqual(b);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("keeps a bounded number of places, dropping the oldest", async () => {
    const { fetchImpl, service } = setup({ maxCells: 2 });
    await service.currentWeather(51.5, -0.13);
    await service.currentWeather(52.5, -1.13);
    await service.currentWeather(53.5, -2.13);
    expect(service.cells.size).toBe(2);
    await service.currentWeather(51.5, -0.13);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("refuses an invalid place before asking MET", async () => {
    const { fetchImpl, service } = setup();
    await expect(service.currentWeather(123, 0)).rejects.toMatchObject({
      code: "invalid-request",
    });
    await service.currentWeather(51.5, -0.13);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
