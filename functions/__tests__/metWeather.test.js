/**
 * MET Norway weather, the pure half (lib/metWeather.js): the symbol
 * mapping the app's tips read, feels-like, the hour that counts as now,
 * and the per-place cache that keeps MET's terms (Expires,
 * If-Modified-Since, a User-Agent, no more than two decimals sent).
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  MET_USER_AGENT,
  MIN_CACHE_MS,
  SYMBOLS,
  WeatherError,
  validateCoords,
  conditionFor,
  feelsLikeC,
  windChillC,
  heatIndexC,
  currentConditions,
  cacheUntil,
  createWeatherService,
} = require("../lib/metWeather");

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
