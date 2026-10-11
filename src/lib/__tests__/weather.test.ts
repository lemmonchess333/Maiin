import { describe, it, expect } from "vitest";
import { getWeatherIcon, getRunningTip, type WeatherData } from "../weather";
import { heatLine } from "../heatAdjustment";

function makeWeather(overrides: Partial<WeatherData> = {}): WeatherData {
  return {
    temperature: 15,
    feelsLike: 14,
    humidity: 50,
    windSpeed: 10,
    weatherCode: 0,
    description: "Clear sky",
    ...overrides,
  };
}

describe("getWeatherIcon", () => {
  it("returns sun for clear sky (code 0)", () => {
    expect(getWeatherIcon(0)).toBe("sun");
  });

  it("returns sun for mainly clear (code 1)", () => {
    expect(getWeatherIcon(1)).toBe("sun");
  });

  it("returns cloud-sun for partly cloudy", () => {
    expect(getWeatherIcon(2)).toBe("cloud-sun");
  });

  it("returns cloud for overcast", () => {
    expect(getWeatherIcon(3)).toBe("cloud");
  });

  it("returns cloud-fog for fog codes", () => {
    expect(getWeatherIcon(45)).toBe("cloud-fog");
    expect(getWeatherIcon(48)).toBe("cloud-fog");
  });

  it("returns cloud-drizzle for drizzle codes", () => {
    expect(getWeatherIcon(51)).toBe("cloud-drizzle");
    expect(getWeatherIcon(53)).toBe("cloud-drizzle");
    expect(getWeatherIcon(55)).toBe("cloud-drizzle");
  });

  it("returns cloud-rain for rain codes", () => {
    expect(getWeatherIcon(61)).toBe("cloud-rain");
    expect(getWeatherIcon(63)).toBe("cloud-rain");
    expect(getWeatherIcon(65)).toBe("cloud-rain");
  });

  it("returns cloud-snow for snow codes", () => {
    expect(getWeatherIcon(71)).toBe("cloud-snow");
    expect(getWeatherIcon(73)).toBe("cloud-snow");
    expect(getWeatherIcon(75)).toBe("cloud-snow");
  });

  it("returns cloud-rain for rain showers", () => {
    expect(getWeatherIcon(80)).toBe("cloud-rain");
    expect(getWeatherIcon(82)).toBe("cloud-rain");
  });

  it("returns cloud-lightning for thunderstorm", () => {
    expect(getWeatherIcon(95)).toBe("cloud-lightning");
    expect(getWeatherIcon(96)).toBe("cloud-lightning");
    expect(getWeatherIcon(99)).toBe("cloud-lightning");
  });

  it("returns cloud-sun for unknown codes below 45", () => {
    expect(getWeatherIcon(10)).toBe("cloud-sun");
  });
});

describe("getRunningTip", () => {
  it("says nothing when there is nothing actionable to say", () => {
    /* The regression this closes: the fallback returned
       "27°C, clear sky — enjoy your run" while the card directly above it
       already read "27°C (feels 26°) · Clear sky". 27°C was the exact gap
       case — below the 28°C "Warm" tip the function had then, above the
       10-18°C "great conditions" band — so it fell through on a real
       device. */
    const w = makeWeather({
      temperature: 27,
      humidity: 40,
      windSpeed: 5,
      weatherCode: 0,
      description: "Clear sky",
    });
    expect(getRunningTip(w)).toBeNull();
  });

  it("still speaks up whenever the conditions call for it", () => {
    // The other half of the control: a helper that returned null for
    // EVERYTHING would satisfy the assertion above while silencing every
    // real warning. Heat is not on this list: it is the heat line's
    // (below).
    expect(getRunningTip(makeWeather({ temperature: 0 }))).toBeTruthy();
    expect(getRunningTip(makeWeather({ windSpeed: 35 }))).toBeTruthy();
    expect(getRunningTip(makeWeather({ weatherCode: 63 }))).toBeTruthy();
  });

  it("never echoes the temperature the card already shows", () => {
    /* Directly pins the shape of the bug rather than one input: no tip may
       restate the numeric temperature, because the headline owns it. */
    for (const temperature of [-5, 0, 5, 12, 20, 27, 29, 33]) {
      for (const humidity of [30, 65, 80]) {
        const tip = getRunningTip(makeWeather({ temperature, humidity }));
        if (tip) expect(tip).not.toContain(`${temperature}°C`);
      }
    }
  });

  it("warns about rain", () => {
    const w = makeWeather({ weatherCode: 63 });
    expect(getRunningTip(w)).toMatch(/rainy/i);
  });

  it("gives interval-specific rain tip", () => {
    const w = makeWeather({ weatherCode: 63 });
    expect(getRunningTip(w, "intervals")).toMatch(/track/i);
  });

  it("warns about snow", () => {
    const w = makeWeather({ weatherCode: 73 });
    expect(getRunningTip(w)).toMatch(/snowy/i);
  });

  it("suggests treadmill for thunderstorm", () => {
    const w = makeWeather({ weatherCode: 95 });
    expect(getRunningTip(w)).toMatch(/thunderstorm/i);
  });

  it("warns about very windy conditions (30+)", () => {
    const w = makeWeather({ temperature: 15, windSpeed: 35 });
    expect(getRunningTip(w)).toMatch(/very windy/i);
  });

  it("mentions windy for moderate wind (20-29)", () => {
    const w = makeWeather({ temperature: 15, windSpeed: 22 });
    expect(getRunningTip(w)).toMatch(/windy/i);
  });

  it("warns about freezing conditions", () => {
    const w = makeWeather({ temperature: -2 });
    expect(getRunningTip(w)).toMatch(/freezing/i);
  });

  it("warns about cold conditions (0-5)", () => {
    const w = makeWeather({ temperature: 3 });
    expect(getRunningTip(w)).toMatch(/cold/i);
  });

  it("returns the good-conditions line on ideal weather", () => {
    const w = makeWeather({ temperature: 14, humidity: 50, windSpeed: 8 });
    expect(getRunningTip(w)).toMatch(/good conditions/i);
  });

  it("stays quiet on unremarkable weather", () => {
    /* This test used to assert the opposite — that 22°C partly cloudy
       produced "22°C, partly cloudy — enjoy your run". That WAS the
       behaviour, and it was the bug: the weather card renders the
       temperature and description immediately above this line, so the tip
       spent a row repeating them. Rewritten rather than deleted because the
       input is still the case worth covering; only the expectation changed. */
    const w = makeWeather({
      temperature: 22,
      humidity: 55,
      windSpeed: 12,
      description: "Partly cloudy",
    });
    expect(getRunningTip(w)).toBeNull();
  });
});

describe("getRunningTip leaves heat to the heat line (Pgm8 (E8))", () => {
  /* One heat line, not two. On a hot day the heat line says to run by
     feel (`heatLine`, heatAdjustment.ts), and below hot nothing speaks
     about heat, so the tip never does. Its "Hot & humid", "Very hot" and
     "Warm" tips went with that decision. */

  it("says nothing about heat on the days its heat tips used to fire", () => {
    // Both days are hot by the heat line's rule, so they get that line.
    const humid = makeWeather({ temperature: 32, humidity: 70 }); // 168°F
    const warm = makeWeather({ temperature: 29, humidity: 40 }); // 141°F
    expect(heatLine(humid)).not.toBeNull();
    expect(heatLine(warm)).not.toBeNull();
    // Were "Very hot — hydrate well before, go easy on pace" and, on a
    // long run, "Hot & humid — carry water, add walk breaks every 3 km".
    expect(getRunningTip(humid)).toBeNull();
    expect(getRunningTip(humid, "long")).toBeNull();
    // Was "Warm — start slower than usual, stay hydrated".
    expect(getRunningTip(warm)).toBeNull();
  });

  it("keeps its other tips on a hot day", () => {
    const hot = { temperature: 32, humidity: 70 };
    expect(getRunningTip(makeWeather({ ...hot, weatherCode: 63 }))).toMatch(
      /rainy/i
    );
    expect(getRunningTip(makeWeather({ ...hot, weatherCode: 95 }))).toMatch(
      /thunderstorm/i
    );
    expect(getRunningTip(makeWeather({ ...hot, windSpeed: 35 }))).toMatch(
      /very windy/i
    );
  });

  it("says nothing about heat below hot either", () => {
    /* 30°C at 20% humidity sums to 126°F, the T+DP table's 2% band: not
       hot, so there is no heat line. The "Warm" tip fired here (28°C and
       up) and would now be a second rule about heat, speaking where the
       decided one is quiet. The wind tip it used to crowd out speaks. */
    const warmDry = makeWeather({ temperature: 30, humidity: 20 });
    expect(heatLine(warmDry)).toBeNull();
    expect(getRunningTip(warmDry)).toBeNull();
    expect(getRunningTip({ ...warmDry, windSpeed: 25 })).toMatch(/^Windy/);
  });

  it("gives no heat line of its own on any day", () => {
    /* From 6°C up, so the cold tips' "warm up" never fires here. Also
       checks the good-conditions line never sits beside the heat line. */
    const heatWords = /\b(hot|heat|humid|hydrat\w*|water|warm)\b/i;
    const offenders: string[] = [];
    for (let temperature = 6; temperature <= 45; temperature++) {
      for (let humidity = 5; humidity <= 100; humidity += 5) {
        for (const windSpeed of [5, 25, 35]) {
          for (const weatherCode of [0, 3, 63, 95]) {
            const w = makeWeather({
              temperature,
              humidity,
              windSpeed,
              weatherCode,
            });
            for (const activity of [undefined, "easy", "long", "intervals"]) {
              const tip = getRunningTip(w, activity);
              if (!tip) continue;
              if (
                heatWords.test(tip) ||
                (heatLine(w) && /no adjust/i.test(tip))
              )
                offenders.push(
                  `${temperature}°C ${humidity}% ${windSpeed} km/h ` +
                    `code ${weatherCode} ${activity}: ${tip}`
                );
            }
          }
        }
      }
    }
    expect(offenders.length, offenders.slice(0, 5).join("\n")).toBe(0);
  });
});
