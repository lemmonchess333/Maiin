/**
 * getCurrentWeather on the phone: it asks Tropos's getCurrentWeather
 * callable (MET Norway behind it) with the position rounded to two decimal
 * places, only once location permission is already granted, keeps a
 * reading for ten minutes, and answers null on any failure — the run setup
 * strip then simply does not show.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const call = vi.hoisted(() => ({
  names: [] as string[],
  fn: vi.fn(),
}));
vi.mock("firebase/functions", () => ({
  getFunctions: () => ({}),
  httpsCallable: (_functions: unknown, name: string) => {
    call.names.push(name);
    return call.fn;
  },
}));

const READING = {
  temperature: 14,
  feelsLike: 14,
  humidity: 72,
  windSpeed: 11,
  weatherCode: 61,
  description: "Light rain",
};

let permission: PermissionState;
const query = vi.fn();
const getCurrentPosition = vi.fn();

async function load() {
  vi.resetModules();
  return import("../weather");
}

beforeEach(() => {
  call.names.length = 0;
  call.fn.mockReset();
  call.fn.mockResolvedValue({ data: READING });
  permission = "granted";
  query.mockReset();
  query.mockImplementation(async () => ({ state: permission }));
  getCurrentPosition.mockReset();
  getCurrentPosition.mockImplementation((ok: PositionCallback) =>
    ok({
      coords: { latitude: 51.507351, longitude: -0.127758 },
    } as GeolocationPosition)
  );
  vi.stubGlobal("navigator", {
    permissions: { query },
    geolocation: { getCurrentPosition },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("getCurrentWeather", () => {
  it("asks the callable with the position rounded to two decimal places", async () => {
    const { getCurrentWeather } = await load();
    expect(await getCurrentWeather()).toEqual(READING);
    expect(call.names).toEqual(["getCurrentWeather"]);
    expect(call.fn).toHaveBeenCalledWith({ lat: 51.51, lon: -0.13 });
  });

  it("never sends a full-precision position", async () => {
    const { getCurrentWeather } = await load();
    await getCurrentWeather();
    const [{ lat, lon }] = call.fn.mock.calls[0] as [
      { lat: number; lon: number },
    ];
    for (const value of [lat, lon]) {
      expect(Math.round(value * 100) / 100).toBe(value);
    }
  });

  it("asks nothing until location permission is already granted", async () => {
    permission = "prompt";
    const { getCurrentWeather } = await load();
    expect(await getCurrentWeather()).toBeNull();
    // The permission was read; the position was not asked for.
    expect(query).toHaveBeenCalledWith({ name: "geolocation" });
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(call.fn).not.toHaveBeenCalled();
  });

  it("answers null where the permission cannot be read", async () => {
    query.mockRejectedValueOnce(new TypeError("not supported"));
    const { getCurrentWeather } = await load();
    expect(await getCurrentWeather()).toBeNull();
    expect(query).toHaveBeenCalledOnce();
    expect(call.fn).not.toHaveBeenCalled();
  });

  it("keeps a reading for ten minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-04T10:00:00Z"));
    const { getCurrentWeather } = await load();
    await getCurrentWeather();
    vi.setSystemTime(new Date("2026-10-04T10:09:59Z"));
    expect(await getCurrentWeather()).toEqual(READING);
    expect(call.fn).toHaveBeenCalledOnce();
    vi.setSystemTime(new Date("2026-10-04T10:10:01Z"));
    await getCurrentWeather();
    expect(call.fn).toHaveBeenCalledTimes(2);
  });

  it("asks once for callers that ask at the same time", async () => {
    // The run page, its setup and Home's day can each ask while the first
    // read is still under way: one lookup answers them all.
    const { getCurrentWeather } = await load();
    const answers = await Promise.all([
      getCurrentWeather(),
      getCurrentWeather(),
      getCurrentWeather(),
    ]);
    expect(answers).toEqual([READING, READING, READING]);
    expect(call.fn).toHaveBeenCalledOnce();
    expect(getCurrentPosition).toHaveBeenCalledOnce();
  });

  it("answers null when the callable fails, and asks again next time", async () => {
    call.fn.mockRejectedValueOnce(
      Object.assign(new Error("unavailable"), { code: "functions/unavailable" })
    );
    const { getCurrentWeather } = await load();
    expect(await getCurrentWeather()).toBeNull();
    expect(await getCurrentWeather()).toEqual(READING);
    expect(call.fn).toHaveBeenCalledTimes(2);
  });

  it("answers null for an answer without the strip's fields", async () => {
    call.fn.mockResolvedValueOnce({ data: { temperature: "warm" } });
    const { getCurrentWeather } = await load();
    expect(await getCurrentWeather()).toBeNull();
    expect(call.fn).toHaveBeenCalledOnce();
  });

  it("reads the next hours the callable sends, in time order, dropping any that isn't one (Run26 (5))", async () => {
    call.fn.mockResolvedValueOnce({
      data: {
        ...READING,
        hours: [
          { time: "2026-07-15T20:00:00.000Z", temperature: 24, dewPoint: 20 },
          { time: "2026-07-15T19:00:00.000Z", temperature: 26, dewPoint: 21 },
          { time: "not a time", temperature: 20, dewPoint: 15 },
          { time: "2026-07-15T21:00:00.000Z", temperature: "cool" },
          null,
        ],
      },
    });
    const { getCurrentWeather } = await load();
    expect((await getCurrentWeather())?.hours).toEqual([
      { at: Date.parse("2026-07-15T19:00:00Z"), temperature: 26, dewPoint: 21 },
      { at: Date.parse("2026-07-15T20:00:00Z"), temperature: 24, dewPoint: 20 },
    ]);
  });

  it("reads an answer without hours, from a server that predates them, as before: no hours, and no coolest hour", async () => {
    // A hot reading with no hours: the heat line still shows, the coolest
    // hour can't.
    call.fn.mockResolvedValueOnce({
      data: { ...READING, temperature: 32, humidity: 70 },
    });
    const { getCurrentWeather } = await load();
    const { coolestHourAhead, isHotDay } = await import("../heatAdjustment");
    const weather = await getCurrentWeather();
    expect(weather).not.toBeNull();
    expect(weather).not.toHaveProperty("hours");
    expect(isHotDay(weather)).toBe(true);
    expect(coolestHourAhead(weather, Date.now())).toBeNull();
  });

  it("answers null when the position cannot be had", async () => {
    getCurrentPosition.mockImplementationOnce(
      (_ok: PositionCallback, fail: PositionErrorCallback) =>
        fail({ code: 3, message: "timeout" } as GeolocationPositionError)
    );
    const { getCurrentWeather } = await load();
    expect(await getCurrentWeather()).toBeNull();
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(call.fn).not.toHaveBeenCalled();
  });
});
