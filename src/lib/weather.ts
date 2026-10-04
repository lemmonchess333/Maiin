/**
 * Weather pre-run tips: the current weather for the run setup strip, a
 * 10-minute cache, and activity-aware tips.
 *
 * The phone does not call a weather service. It sends its position,
 * rounded to two decimal places (about a kilometre), to Tropos's
 * getCurrentWeather callable (functions/currentWeather.js), which asks MET
 * Norway. MET sees neither the phone's address nor a precise place. Until
 * 2026-10 this called Open-Meteo's free API directly with full-precision
 * coordinates: that API is for non-commercial use only, and its licence
 * needed a credit the app never showed.
 *
 * MET's data is CC BY 4.0, so wherever weather shows, WEATHER_CREDIT goes
 * with it. The weather codes are WMO's, which the server maps MET's
 * symbols onto (weatherSymbols.cross.test.ts holds the two together); the
 * description is MET's own wording.
 */
import { getFunctions, httpsCallable } from "firebase/functions";

export interface WeatherData {
  temperature: number;
  feelsLike: number;
  humidity: number;
  /** km/h, which the tips below are written in. */
  windSpeed: number;
  weatherCode: number;
  description: string;
}

/** The credit MET Norway's licence asks for, shown wherever weather is. */
export const WEATHER_CREDIT = "Weather data from MET Norway";

// 10-minute module-level cache
let cachedWeather: { data: WeatherData; timestamp: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

/** Two decimal places, about 1.1 km: all a forecast needs, and all the app
 *  hands on. The server rounds again, for a client that does not. */
export function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The server's answer, if it has the shape the strip draws, as a copy
 *  holding only those fields. */
export function asWeatherData(value: unknown): WeatherData | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const numbers = [
    "temperature",
    "feelsLike",
    "humidity",
    "windSpeed",
    "weatherCode",
  ] as const;
  for (const key of numbers) {
    if (typeof v[key] !== "number" || !Number.isFinite(v[key])) return null;
  }
  if (typeof v.description !== "string" || !v.description) return null;
  return {
    temperature: v.temperature as number,
    feelsLike: v.feelsLike as number,
    humidity: v.humidity as number,
    windSpeed: v.windSpeed as number,
    weatherCode: v.weatherCode as number,
    description: v.description,
  };
}

export async function getCurrentWeather(): Promise<WeatherData | null> {
  // Return cache if fresh
  if (cachedWeather && Date.now() - cachedWeather.timestamp < CACHE_TTL) {
    return cachedWeather.data;
  }

  // Only fetch if geo permission is already granted
  try {
    const perm = await navigator.permissions.query({ name: "geolocation" });
    if (perm.state !== "granted") return null;
  } catch {
    return null;
  }

  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 5000,
        maximumAge: 300000,
      })
    );

    const lookup = httpsCallable<{ lat: number; lon: number }, unknown>(
      getFunctions(),
      "getCurrentWeather"
    );
    const { data: answer } = await lookup({
      lat: roundCoord(pos.coords.latitude),
      lon: roundCoord(pos.coords.longitude),
    });
    const data = asWeatherData(answer);
    if (!data) return null;

    cachedWeather = { data, timestamp: Date.now() };
    return data;
  } catch {
    return null;
  }
}

export function getWeatherIcon(code: number): string {
  if (code === 0 || code === 1) return "sun";
  if (code === 2) return "cloud-sun";
  if (code === 3) return "cloud";
  if (code >= 45 && code <= 48) return "cloud-fog";
  if (code >= 51 && code <= 55) return "cloud-drizzle";
  if (code >= 61 && code <= 65) return "cloud-rain";
  if (code >= 71 && code <= 75) return "cloud-snow";
  if (code >= 80 && code <= 82) return "cloud-rain";
  if (code >= 95) return "cloud-lightning";
  return "cloud-sun";
}

/**
 * An ACTIONABLE line about today's conditions, or null when there is nothing
 * worth saying.
 *
 * There is deliberately no pleasant fallback ("27°C, clear sky — enjoy your
 * run"): the weather card directly above already shows those two facts, and
 * every branch here earns its line by telling you to do something
 * differently.
 *
 * Returning null rather than a pleasantry follows `heatPaceAdjustment`, which
 * is quiet in cool weather for the same reason. Note the two are
 * complementary: 27°C sits below the 28°C "Warm" threshold, so on that exact
 * day the only line with content is the heat check, and the fallback was
 * crowding it.
 */
export function getRunningTip(
  weather: WeatherData,
  activityType?: string
): string | null {
  const { temperature, humidity, windSpeed, weatherCode } = weather;

  // Rain
  if (weatherCode >= 61 && weatherCode <= 65) {
    return activityType === "intervals"
      ? "Wet track — watch your footing on turns"
      : "Rainy — wear a light shell, avoid cotton";
  }

  // Snow
  if (weatherCode >= 71 && weatherCode <= 75) {
    return "Snowy — trail shoes and shorter stride for grip";
  }

  // Thunderstorm
  if (weatherCode >= 95) {
    return "Thunderstorm — consider postponing or using a treadmill";
  }

  // Hot + humid
  if (temperature >= 30 && humidity >= 60) {
    return activityType === "long"
      ? "Hot & humid — carry water, add walk breaks every 3 km"
      : "Very hot — hydrate well before, go easy on pace";
  }

  // Hot
  if (temperature >= 28) {
    return "Warm — start slower than usual, stay hydrated";
  }

  // Windy
  if (windSpeed >= 30) {
    return "Very windy — start into the wind, finish with it behind you";
  }
  if (windSpeed >= 20) {
    return "Windy — expect a slower pace for the same effort";
  }

  // Cold
  if (temperature <= 0) {
    return "Freezing — layer up, gloves are a must, warm up indoors";
  }
  if (temperature <= 5) {
    return "Cold — extra warm-up time, breathe through your nose";
  }

  // Perfect conditions
  if (
    temperature >= 10 &&
    temperature <= 18 &&
    humidity < 70 &&
    windSpeed < 15
  ) {
    return "Good conditions — no adjustments needed";
  }

  return null;
}
