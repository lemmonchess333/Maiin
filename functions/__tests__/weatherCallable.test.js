/**
 * getCurrentWeather (weather.js), driven through `.run(data, context)`
 * from the index that deploys it, with MET's fetch stubbed. The per-user
 * limiter and the deletion lock are swapped on their shared modules (the
 * callable calls both through the module), so nothing reaches Firestore.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-tropos";

const rateLimiter = require("../rateLimiter");
const accountDeletionLocks = require("../lib/accountDeletionLocks");
const { getCurrentWeather } = require("../index");
const { _weatherService, WEATHER_CALLS_PER_HOUR } = require("../weather");

const CONTEXT = { auth: { uid: "runner" } };

const realIsRateLimited = rateLimiter.isRateLimited;
const realActorLock = accountDeletionLocks.assertCallableActorNotDeleting;

let limiterCalls;
let limited;
let fetchMock;

function metBody() {
  const now = Date.now();
  const hourStart = now - (now % 3_600_000);
  return {
    type: "Feature",
    properties: {
      meta: {},
      timeseries: [0, 1, 2].map((i) => ({
        time: new Date(hourStart + i * 3_600_000).toISOString(),
        data: {
          instant: {
            details: {
              air_temperature: 3.4,
              relative_humidity: 88,
              wind_speed: 6,
            },
          },
          next_1_hours: { summary: { symbol_code: "lightrain" }, details: {} },
        },
      })),
    },
  };
}

beforeEach(() => {
  limiterCalls = [];
  limited = false;
  rateLimiter.isRateLimited = async (_db, uid, action, maxCalls, windowMs) => {
    limiterCalls.push({ uid, action, maxCalls, windowMs });
    return limited;
  };
  accountDeletionLocks.assertCallableActorNotDeleting = async () => {};
  _weatherService.cells.clear();
  fetchMock = vi.fn(async () => ({
    status: 200,
    ok: true,
    headers: new Headers({}),
    json: async () => metBody(),
  }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  rateLimiter.isRateLimited = realIsRateLimited;
  accountDeletionLocks.assertCallableActorNotDeleting = realActorLock;
  vi.unstubAllGlobals();
});

describe("getCurrentWeather", () => {
  it("returns the app's WeatherData from MET for a signed-in user", async () => {
    const weather = await getCurrentWeather.run(
      { lat: 59.913868, lon: 10.752245 },
      CONTEXT
    );
    expect(weather).toEqual({
      temperature: 3,
      // 3.4 °C in a 21.6 km/h wind: the wind chill.
      feelsLike: -1,
      humidity: 88,
      windSpeed: 22,
      weatherCode: 61,
      description: "Light rain",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url).host).toBe("api.met.no");
    expect(new URL(url).searchParams.get("lat")).toBe("59.91");
    expect(new URL(url).searchParams.get("lon")).toBe("10.75");
    expect(init.headers["User-Agent"]).toMatch(
      /^Tropos\/\S+ support@troposfit\.com$/
    );
  });

  it("refuses a signed-out caller before asking MET", async () => {
    await expect(
      getCurrentWeather.run({ lat: 51.5, lon: -0.13 }, {})
    ).rejects.toMatchObject({ code: "unauthenticated" });
    expect(limiterCalls).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("limits each user, and a limited call never reaches MET", async () => {
    limited = true;
    await expect(
      getCurrentWeather.run({ lat: 51.5, lon: -0.13 }, CONTEXT)
    ).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(limiterCalls).toEqual([
      {
        uid: "runner",
        action: "weather",
        maxCalls: WEATHER_CALLS_PER_HOUR,
        windowMs: 3_600_000,
      },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers invalid-argument for a place that is not one", async () => {
    await expect(
      getCurrentWeather.run({ lat: 120, lon: 0 }, CONTEXT)
    ).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(getCurrentWeather.run(null, CONTEXT)).rejects.toMatchObject({
      code: "invalid-argument",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers unavailable when MET fails", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 503,
      ok: false,
      headers: new Headers({}),
      json: async () => ({}),
    });
    await expect(
      getCurrentWeather.run({ lat: 51.5, lon: -0.13 }, CONTEXT)
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
