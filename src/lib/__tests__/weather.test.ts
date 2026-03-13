import { describe, it, expect } from 'vitest';
import { getWeatherIcon, getRunningTip, type WeatherData } from '../weather';

function makeWeather(overrides: Partial<WeatherData> = {}): WeatherData {
  return {
    temperature: 15,
    feelsLike: 14,
    humidity: 50,
    windSpeed: 10,
    weatherCode: 0,
    description: 'Clear sky',
    ...overrides,
  };
}

describe('getWeatherIcon', () => {
  it('returns sun for clear sky (code 0)', () => {
    expect(getWeatherIcon(0)).toBe('sun');
  });

  it('returns sun for mainly clear (code 1)', () => {
    expect(getWeatherIcon(1)).toBe('sun');
  });

  it('returns cloud-sun for partly cloudy', () => {
    expect(getWeatherIcon(2)).toBe('cloud-sun');
  });

  it('returns cloud for overcast', () => {
    expect(getWeatherIcon(3)).toBe('cloud');
  });

  it('returns cloud-fog for fog codes', () => {
    expect(getWeatherIcon(45)).toBe('cloud-fog');
    expect(getWeatherIcon(48)).toBe('cloud-fog');
  });

  it('returns cloud-drizzle for drizzle codes', () => {
    expect(getWeatherIcon(51)).toBe('cloud-drizzle');
    expect(getWeatherIcon(53)).toBe('cloud-drizzle');
    expect(getWeatherIcon(55)).toBe('cloud-drizzle');
  });

  it('returns cloud-rain for rain codes', () => {
    expect(getWeatherIcon(61)).toBe('cloud-rain');
    expect(getWeatherIcon(63)).toBe('cloud-rain');
    expect(getWeatherIcon(65)).toBe('cloud-rain');
  });

  it('returns cloud-snow for snow codes', () => {
    expect(getWeatherIcon(71)).toBe('cloud-snow');
    expect(getWeatherIcon(73)).toBe('cloud-snow');
    expect(getWeatherIcon(75)).toBe('cloud-snow');
  });

  it('returns cloud-rain for rain showers', () => {
    expect(getWeatherIcon(80)).toBe('cloud-rain');
    expect(getWeatherIcon(82)).toBe('cloud-rain');
  });

  it('returns cloud-lightning for thunderstorm', () => {
    expect(getWeatherIcon(95)).toBe('cloud-lightning');
    expect(getWeatherIcon(96)).toBe('cloud-lightning');
    expect(getWeatherIcon(99)).toBe('cloud-lightning');
  });

  it('returns cloud-sun for unknown codes below 45', () => {
    expect(getWeatherIcon(10)).toBe('cloud-sun');
  });
});

describe('getRunningTip', () => {
  it('warns about rain', () => {
    const w = makeWeather({ weatherCode: 63 });
    expect(getRunningTip(w)).toMatch(/rainy/i);
  });

  it('gives interval-specific rain tip', () => {
    const w = makeWeather({ weatherCode: 63 });
    expect(getRunningTip(w, 'intervals')).toMatch(/track/i);
  });

  it('warns about snow', () => {
    const w = makeWeather({ weatherCode: 73 });
    expect(getRunningTip(w)).toMatch(/snowy/i);
  });

  it('suggests treadmill for thunderstorm', () => {
    const w = makeWeather({ weatherCode: 95 });
    expect(getRunningTip(w)).toMatch(/thunderstorm/i);
  });

  it('warns about hot and humid conditions', () => {
    const w = makeWeather({ temperature: 32, humidity: 70 });
    expect(getRunningTip(w)).toMatch(/hot/i);
  });

  it('gives long-run specific heat tip', () => {
    const w = makeWeather({ temperature: 32, humidity: 70 });
    expect(getRunningTip(w, 'long')).toMatch(/carry water/i);
  });

  it('warns about warm weather (28+)', () => {
    const w = makeWeather({ temperature: 29, humidity: 40 });
    expect(getRunningTip(w)).toMatch(/warm/i);
  });

  it('warns about very windy conditions (30+)', () => {
    const w = makeWeather({ temperature: 15, windSpeed: 35 });
    expect(getRunningTip(w)).toMatch(/very windy/i);
  });

  it('mentions windy for moderate wind (20-29)', () => {
    const w = makeWeather({ temperature: 15, windSpeed: 22 });
    expect(getRunningTip(w)).toMatch(/windy/i);
  });

  it('warns about freezing conditions', () => {
    const w = makeWeather({ temperature: -2 });
    expect(getRunningTip(w)).toMatch(/freezing/i);
  });

  it('warns about cold conditions (0-5)', () => {
    const w = makeWeather({ temperature: 3 });
    expect(getRunningTip(w)).toMatch(/cold/i);
  });

  it('celebrates perfect conditions', () => {
    const w = makeWeather({ temperature: 14, humidity: 50, windSpeed: 8 });
    expect(getRunningTip(w)).toMatch(/great conditions/i);
  });

  it('returns generic tip for unremarkable weather', () => {
    const w = makeWeather({ temperature: 22, humidity: 55, windSpeed: 12, description: 'Partly cloudy' });
    expect(getRunningTip(w)).toContain('22°C');
    expect(getRunningTip(w)).toMatch(/enjoy/i);
  });
});
