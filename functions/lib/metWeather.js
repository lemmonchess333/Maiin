/**
 * Current weather from MET Norway's Locationforecast 2.0 (compact): the
 * pure half of the getCurrentWeather callable (functions/currentWeather.js).
 *
 * MET's data may be used commercially under CC BY 4.0, credited to "MET
 * Norway"; the app says "Weather data from MET Norway" wherever it shows
 * weather. Its terms of service ask three things of a client, and all
 * three are kept here:
 *  - identify itself in the User-Agent (an anonymous one gets a 403);
 *  - send coordinates with no more than four decimals. Two are sent,
 *    about a kilometre, which is all a forecast needs and all the app
 *    should hand on;
 *  - not ask again for a place before the response's Expires time, and
 *    send If-Modified-Since when it does ask.
 *
 * The app's weather strip and its tips (getWeatherIcon and getRunningTip
 * in src/lib/weather.ts) read the WMO weather codes the old Open-Meteo
 * feed returned. Each MET symbol is mapped to the WMO code that names the
 * same weather, using only codes the client knows, and
 * src/lib/__tests__/weatherSymbols.cross.test.ts holds every symbol here
 * against the client's icon and tips.
 *
 * The answer also carries the next hours (Run26 (5), today's coolest
 * hour): each hour's start, air temperature and dew point, read from the
 * same response, so it costs MET no second request. The compact product
 * has no dew point (MET's data model lists `dew_point_temperature` only in
 * complete.json), so it is worked out from the hour's air temperature and
 * relative humidity, as the app already works out the current hour's.
 * The field is additive: an app that predates it reads the fields it
 * knows and leaves `hours` alone.
 *
 * Privacy: nothing here logs or keeps a coordinate beyond the rounded
 * cache key, and the cache lives only in the function instance's memory.
 */

"use strict";

const MET_ENDPOINT =
  "https://api.met.no/weatherapi/locationforecast/2.0/compact";
/* MET blocks an anonymous or generic User-Agent. It wants the
   application's name and a way to reach whoever runs it. */
const MET_USER_AGENT = "Tropos/1.2 support@troposfit.com";

/** A place's forecast is kept at least this long, and longer when MET's
 *  Expires header says so. */
const MIN_CACHE_MS = 10 * 60 * 1000;
/** Cached places per function instance, oldest dropped first. */
const MAX_CACHE_CELLS = 1000;
/** A forecast hour further than this from now is not "now". */
const MAX_HOUR_GAP_MS = 90 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** How many hours ahead the answer carries (Run26 (5)): twelve, a Tropos
 *  heuristic, enough to reach from a morning to the evening or from an
 *  afternoon to the night. Every response has them already: MET's steps
 *  are hourly at first, then six-hourly (api.met.no's ForecastJSON
 *  documentation), and four recorded responses, from Norway, France and
 *  New Zealand, ran hourly for 54 to 61 hours. */
const NEXT_HOURS = 12;
/** The stretch of the forecast worth keeping: a little behind now, and
 *  ahead far enough that a forecast held until its Expires time, or
 *  served stale through an outage, still has twelve hours ahead of it
 *  (three hours' slack, a Tropos heuristic). */
const KEEP_BEHIND_MS = 2 * HOUR_MS;
const KEEP_AHEAD_MS = (NEXT_HOURS + 3) * HOUR_MS;

class WeatherError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "WeatherError";
    this.code = code; // invalid-request | provider-unavailable
  }
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/** Two decimal places: about 1.1 km of latitude. */
function roundCoord(value) {
  return Math.round(value * 100) / 100;
}

/** Valid coordinates rounded to two places, or throws invalid-request. */
function validateCoords(lat, lon) {
  if (
    !isFiniteNumber(lat) ||
    !isFiniteNumber(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    throw new WeatherError("invalid-request", "Invalid coordinates.");
  }
  return { lat: roundCoord(lat), lon: roundCoord(lon) };
}

/**
 * Every MET weather symbol (api.met.no weathericon legend), as the WMO
 * code naming the same weather and MET's own English description. The
 * `_day` / `_night` / `_polartwilight` variants share their symbol's row.
 *
 * The WMO codes are the ones the client knows (src/lib/weather.ts):
 *  - rain and sleet 61/63/65 (the rain tip), their showers 80/81/82;
 *  - snow and snow showers 71/73/75 (the snow tip; WMO's 85/86 would
 *    fall through the client's icon table to a sun);
 *  - anything with thunder 95 (the thunderstorm tip);
 *  - fog 45; clear, fair, partly cloudy, cloudy 0/1/2/3.
 * "lightssleet…" and "lightssnow…" are MET's own spellings.
 */
const SYMBOLS = Object.freeze({
  clearsky: [0, "Clear sky"],
  fair: [1, "Fair"],
  partlycloudy: [2, "Partly cloudy"],
  cloudy: [3, "Cloudy"],
  fog: [45, "Fog"],
  lightrainshowers: [80, "Light rain showers"],
  rainshowers: [81, "Rain showers"],
  heavyrainshowers: [82, "Heavy rain showers"],
  lightrainshowersandthunder: [95, "Light rain showers and thunder"],
  rainshowersandthunder: [95, "Rain showers and thunder"],
  heavyrainshowersandthunder: [95, "Heavy rain showers and thunder"],
  lightsleetshowers: [80, "Light sleet showers"],
  sleetshowers: [81, "Sleet showers"],
  heavysleetshowers: [82, "Heavy sleet showers"],
  lightssleetshowersandthunder: [95, "Light sleet showers and thunder"],
  sleetshowersandthunder: [95, "Sleet showers and thunder"],
  heavysleetshowersandthunder: [95, "Heavy sleet showers and thunder"],
  lightsnowshowers: [71, "Light snow showers"],
  snowshowers: [73, "Snow showers"],
  heavysnowshowers: [75, "Heavy snow showers"],
  lightssnowshowersandthunder: [95, "Light snow showers and thunder"],
  snowshowersandthunder: [95, "Snow showers and thunder"],
  heavysnowshowersandthunder: [95, "Heavy snow showers and thunder"],
  lightrain: [61, "Light rain"],
  rain: [63, "Rain"],
  heavyrain: [65, "Heavy rain"],
  lightrainandthunder: [95, "Light rain and thunder"],
  rainandthunder: [95, "Rain and thunder"],
  heavyrainandthunder: [95, "Heavy rain and thunder"],
  lightsleet: [61, "Light sleet"],
  sleet: [63, "Sleet"],
  heavysleet: [65, "Heavy sleet"],
  lightsleetandthunder: [95, "Light sleet and thunder"],
  sleetandthunder: [95, "Sleet and thunder"],
  heavysleetandthunder: [95, "Heavy sleet and thunder"],
  lightsnow: [71, "Light snow"],
  snow: [73, "Snow"],
  heavysnow: [75, "Heavy snow"],
  lightsnowandthunder: [95, "Light snow and thunder"],
  snowandthunder: [95, "Snow and thunder"],
  heavysnowandthunder: [95, "Heavy snow and thunder"],
});

/** MET symbol variants are the base name plus one of these. */
const VARIANT = /_(day|night|polartwilight)$/;

/**
 * A MET symbol code as `{ weatherCode, description }`, or null when it
 * names no weather we can describe truthfully. A symbol MET adds later is
 * read by its words, so a thunder, snow or rain symbol still gets its
 * tip; one with none of those words gives null, and the callable then
 * shows no weather rather than the wrong weather.
 */
function conditionFor(symbolCode) {
  if (typeof symbolCode !== "string" || !symbolCode) return null;
  const base = symbolCode.replace(VARIANT, "");
  const row = Object.prototype.hasOwnProperty.call(SYMBOLS, base)
    ? SYMBOLS[base]
    : null;
  if (row) return { weatherCode: row[0], description: row[1] };
  if (base.includes("thunder")) return { weatherCode: 95, description: "Thunder" };
  if (base.includes("snow")) return { weatherCode: 73, description: "Snow" };
  if (base.includes("sleet")) return { weatherCode: 63, description: "Sleet" };
  if (base.includes("rain")) return { weatherCode: 63, description: "Rain" };
  if (base.includes("fog")) return { weatherCode: 45, description: "Fog" };
  return null;
}

/** Wind chill (the Environment Canada / NWS formula, metric). */
function windChillC(tempC, windKmh) {
  const v = Math.pow(windKmh, 0.16);
  return 13.12 + 0.6215 * tempC - 11.37 * v + 0.3965 * tempC * v;
}

/** Heat index (the NWS algorithm: Steadman's simple form, then the
 *  Rothfusz regression with its two adjustments), in °C. */
function heatIndexC(tempC, humidity) {
  const t = (tempC * 9) / 5 + 32;
  const rh = humidity;
  let hi = 0.5 * (t + 61 + (t - 68) * 1.2 + rh * 0.094);
  if ((hi + t) / 2 >= 80) {
    hi =
      -42.379 +
      2.04901523 * t +
      10.14333127 * rh -
      0.22475541 * t * rh -
      0.00683783 * t * t -
      0.05481717 * rh * rh +
      0.00122874 * t * t * rh +
      0.00085282 * t * rh * rh -
      0.00000199 * t * t * rh * rh;
    if (rh < 13 && t >= 80 && t <= 112) {
      hi -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(t - 95)) / 17);
    } else if (rh > 85 && t >= 80 && t <= 87) {
      hi += ((rh - 85) / 10) * ((87 - t) / 5);
    }
  }
  return ((hi - 32) * 5) / 9;
}

/**
 * Feels-like temperature, as the US National Weather Service works it out:
 * wind chill at 10 °C and below when the wind is over 4.8 km/h, the heat
 * index from 26.7 °C (80 °F) up, and the air temperature itself between,
 * where neither applies. The strip shows "(feels …)" only when this
 * differs from the temperature.
 */
function feelsLikeC(tempC, windKmh, humidity) {
  if (tempC <= 10 && windKmh > 4.8) return windChillC(tempC, windKmh);
  if (tempC >= 26.7) return heatIndexC(tempC, humidity);
  return tempC;
}

/**
 * Dew point (°C) from air temperature (°C) and relative humidity (%): the
 * Magnus formula with the constants the WMO's guide gives (17.62 and
 * 243.12 °C), humidity held to 1–100%. The client's `dewPointC`
 * (src/lib/heatAdjustment.ts) is the same formula, and
 * src/lib/__tests__/weatherHours.cross.test.ts holds the two together.
 */
function dewPointC(tempC, humidity) {
  const rh = Math.min(100, Math.max(1, humidity));
  const a = 17.62;
  const b = 243.12;
  const gamma = (a * tempC) / (b + tempC) + Math.log(rh / 100);
  return (b * gamma) / (a - gamma);
}

/** One decimal place: a tenth of a degree. */
function round1(value) {
  return Math.round(value * 10) / 10;
}

/**
 * The forecast's hours after `nowMs` (Run26 (5)): at most twelve, none
 * further than twelve hours ahead, in time order, each as
 * `{ time, temperature, dewPoint }`: the hour's start as an ISO 8601 UTC
 * string, and its air temperature and dew point in °C to a tenth. The dew
 * point is MET's own where the response has one (complete.json) and is
 * worked out from the relative humidity where it doesn't (compact.json,
 * which this module asks for). An hour lacking a value is left out, never
 * guessed.
 */
function nextHours(timeseries, nowMs) {
  if (!Array.isArray(timeseries)) return [];
  const hours = [];
  for (const entry of timeseries) {
    const at = Date.parse(entry && entry.time);
    if (!Number.isFinite(at)) continue;
    if (at <= nowMs || at > nowMs + NEXT_HOURS * HOUR_MS) continue;
    const details =
      entry.data && entry.data.instant && entry.data.instant.details
        ? entry.data.instant.details
        : {};
    const temp = details.air_temperature;
    if (!isFiniteNumber(temp)) continue;
    const dewPoint = isFiniteNumber(details.dew_point_temperature)
      ? details.dew_point_temperature
      : isFiniteNumber(details.relative_humidity)
        ? dewPointC(temp, details.relative_humidity)
        : null;
    if (dewPoint === null) continue;
    hours.push({
      at,
      hour: {
        time: new Date(at).toISOString(),
        temperature: round1(temp),
        dewPoint: round1(dewPoint),
      },
    });
  }
  return hours
    .sort((a, b) => a.at - b.at)
    .slice(0, NEXT_HOURS)
    .map((h) => h.hour);
}

/** The forecast hour's symbol: the next hour's, else the next six's, else
 *  the next twelve's (the longer ones are all a later hour carries). */
function symbolOf(data) {
  for (const period of ["next_1_hours", "next_6_hours", "next_12_hours"]) {
    const code =
      data &&
      data[period] &&
      data[period].summary &&
      data[period].summary.symbol_code;
    if (typeof code === "string" && code) return code;
  }
  return null;
}

/**
 * The app's WeatherData for `nowMs` from a compact timeseries: the hour
 * nearest now, or null when no hour is near enough or the hour lacks a
 * value the app shows. Wind arrives in m/s and leaves in km/h, which the
 * client's tips are written in.
 */
function currentConditions(timeseries, nowMs) {
  if (!Array.isArray(timeseries)) return null;
  let best = null;
  let bestGap = Infinity;
  for (const entry of timeseries) {
    const at = Date.parse(entry && entry.time);
    if (!Number.isFinite(at)) continue;
    const gap = Math.abs(at - nowMs);
    if (gap < bestGap) {
      best = entry;
      bestGap = gap;
    }
  }
  if (!best || bestGap > MAX_HOUR_GAP_MS) return null;
  const details =
    best.data && best.data.instant && best.data.instant.details
      ? best.data.instant.details
      : {};
  const temp = details.air_temperature;
  const humidity = details.relative_humidity;
  const windMs = details.wind_speed;
  if (![temp, humidity, windMs].every(isFiniteNumber)) return null;
  const condition = conditionFor(symbolOf(best.data));
  if (!condition) return null;
  const windKmh = windMs * 3.6;
  return {
    temperature: Math.round(temp),
    feelsLike: Math.round(feelsLikeC(temp, windKmh, humidity)),
    humidity: Math.round(humidity),
    windSpeed: Math.round(windKmh),
    weatherCode: condition.weatherCode,
    description: condition.description,
  };
}

/** The callable's answer for `nowMs`: the current conditions with the
 *  next hours (`nextHours`), or null when there are no current
 *  conditions. */
function weatherAt(timeseries, nowMs) {
  const current = currentConditions(timeseries, nowMs);
  return current ? { ...current, hours: nextHours(timeseries, nowMs) } : null;
}

/** When a forecast fetched at `nowMs` may next be asked for again: MET's
 *  Expires, but never sooner than ten minutes. */
function cacheUntil(expiresHeader, nowMs) {
  const expires = Date.parse(expiresHeader || "");
  return Math.max(nowMs + MIN_CACHE_MS, Number.isFinite(expires) ? expires : 0);
}

function headerOf(response, name) {
  const headers = response && response.headers;
  if (!headers || typeof headers.get !== "function") return null;
  return headers.get(name);
}

/**
 * The forecast service: MET behind a per-place cache. One per function
 * instance (functions/currentWeather.js); tests make their own with a fake fetch
 * and clock.
 *
 * A place is cached by its rounded coordinates until MET's Expires time
 * (ten minutes at least), and asked again with If-Modified-Since; a 304
 * keeps the forecast already held. Requests for a place already being
 * fetched share that fetch. When MET fails and the place's last forecast
 * still covers the current hour, that forecast is served: an outage costs
 * freshness before it costs the weather.
 */
function createWeatherService({
  fetchImpl,
  now = () => Date.now(),
  maxCells = MAX_CACHE_CELLS,
  warn = () => {},
} = {}) {
  const cells = new Map();
  const inFlight = new Map();

  function remember(key, cell) {
    cells.delete(key);
    cells.set(key, cell);
    while (cells.size > maxCells) {
      cells.delete(cells.keys().next().value);
    }
  }

  function trimmed(timeseries, at) {
    return timeseries.filter((entry) => {
      const t = Date.parse(entry && entry.time);
      return (
        Number.isFinite(t) && t >= at - KEEP_BEHIND_MS && t <= at + KEEP_AHEAD_MS
      );
    });
  }

  async function fetchCell(key, lat, lon, previous) {
    const headers = {
      "User-Agent": MET_USER_AGENT,
      Accept: "application/json",
    };
    if (previous && previous.lastModified) {
      headers["If-Modified-Since"] = previous.lastModified;
    }
    const url = `${MET_ENDPOINT}?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`;
    let response;
    try {
      response = await fetchImpl(url, { headers });
    } catch (_) {
      throw new WeatherError("provider-unavailable", "Weather request failed.");
    }
    const at = now();
    if (response.status === 304 && previous) {
      const cell = {
        ...previous,
        until: cacheUntil(headerOf(response, "expires"), at),
      };
      remember(key, cell);
      return cell;
    }
    if (!response.ok) {
      const err = new WeatherError(
        "provider-unavailable",
        "Weather request failed."
      );
      err.status = response.status;
      throw err;
    }
    // 203: MET still answers, but says this product version is going away.
    if (response.status === 203) warn("weather.met_deprecated");
    let body;
    try {
      body = await response.json();
    } catch (_) {
      throw new WeatherError("provider-unavailable", "Unreadable forecast.");
    }
    const series =
      body && body.properties && Array.isArray(body.properties.timeseries)
        ? body.properties.timeseries
        : null;
    if (!series) {
      throw new WeatherError("provider-unavailable", "Unreadable forecast.");
    }
    const cell = {
      timeseries: trimmed(series, at),
      until: cacheUntil(headerOf(response, "expires"), at),
      lastModified: headerOf(response, "last-modified"),
    };
    remember(key, cell);
    return cell;
  }

  function sharedFetch(key, lat, lon, previous) {
    const pending = inFlight.get(key);
    if (pending) return pending;
    const request = fetchCell(key, lat, lon, previous).finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, request);
    return request;
  }

  /** The app's WeatherData for a place, with the next hours, or throws a
   *  WeatherError. */
  async function currentWeather(rawLat, rawLon) {
    const { lat, lon } = validateCoords(rawLat, rawLon);
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const held = cells.get(key);
    const at = now();
    const fresh = held && at < held.until && weatherAt(held.timeseries, at);
    if (fresh) return fresh;

    let cell;
    try {
      cell = await sharedFetch(key, lat, lon, held);
    } catch (err) {
      const stale = held && weatherAt(held.timeseries, now());
      if (stale) return stale;
      throw err;
    }
    const weather = weatherAt(cell.timeseries, now());
    if (!weather) {
      throw new WeatherError(
        "provider-unavailable",
        "No current conditions in the forecast."
      );
    }
    return weather;
  }

  return { currentWeather, cells };
}

module.exports = {
  MET_ENDPOINT,
  MET_USER_AGENT,
  MIN_CACHE_MS,
  MAX_CACHE_CELLS,
  NEXT_HOURS,
  SYMBOLS,
  WeatherError,
  roundCoord,
  validateCoords,
  conditionFor,
  feelsLikeC,
  windChillC,
  heatIndexC,
  currentConditions,
  dewPointC,
  nextHours,
  weatherAt,
  cacheUntil,
  createWeatherService,
};
