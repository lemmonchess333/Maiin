/**
 * Weather Pre-Run Tips — Open-Meteo API, 10-minute cache, activity-aware tips.
 */

export interface WeatherData {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  description: string;
}

// 10-minute module-level cache
let cachedWeather: { data: WeatherData; timestamp: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

const WMO_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with heavy hail",
};

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

    const { latitude, longitude } = pos.coords;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code&timezone=auto`;
    const res = await fetch(url);
    const json = await res.json();
    const c = json.current;

    const data: WeatherData = {
      temperature: Math.round(c.temperature_2m),
      feelsLike: Math.round(c.apparent_temperature),
      humidity: c.relative_humidity_2m,
      windSpeed: Math.round(c.wind_speed_10m),
      weatherCode: c.weather_code,
      description: WMO_CODES[c.weather_code] || "Unknown",
    };

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

export function getRunningTip(weather: WeatherData, activityType?: string): string {
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
      ? "Hot & humid — carry water, add walk breaks every 3km"
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
    return "Windy — expect slower pace, it's a strength workout!";
  }

  // Cold
  if (temperature <= 0) {
    return "Freezing — layer up, gloves are a must, warm up indoors";
  }
  if (temperature <= 5) {
    return "Cold — extra warm-up time, breathe through your nose";
  }

  // Perfect conditions
  if (temperature >= 10 && temperature <= 18 && humidity < 70 && windSpeed < 15) {
    return "Great conditions — perfect running weather!";
  }

  return `${temperature}°C, ${weather.description.toLowerCase()} — enjoy your run`;
}
