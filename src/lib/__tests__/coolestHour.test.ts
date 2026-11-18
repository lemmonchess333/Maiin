/**
 * Today's coolest hour (Run26 (5), heatAdjustment.ts): on a hot day, the
 * coolest hour still to come today, named when it starts at least an hour
 * from now, is at least one band of the T+DP table cooler, and its air a
 * whole degree cooler; in the device region's temperature unit
 * (temperature.ts).
 * Times are built on the device's own clock, so each case reads the same
 * in every time zone CI runs.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  coolestHourAhead,
  coolestHourLine,
  tdpSumF,
  COOLEST_COOLER_BY_F,
  COOLEST_MIN_LEAD_MS,
} from "../heatAdjustment";
import {
  deviceTemperatureUnit,
  temperatureLabel,
  temperatureUnitForLocales,
} from "../temperature";
import { setDeviceLanguage } from "@/test/deviceLanguage";
import type { WeatherHour } from "../weather";

/** 15 July, on the device's clock, at the hour (and minute) given. */
function at(hour: number, minute = 0, day = 15): number {
  return new Date(2026, 6, day, hour, minute).getTime();
}

/** 32 °C at 70%: a T+DP sum of about 168 °F, hot. */
const HOT = { temperature: 32, humidity: 70 };
/** 15 °C at 50%: about 100 °F, mild. */
const MILD = { temperature: 15, humidity: 50 };
/** 36 °C at 80%: about 192 °F, extreme. */
const EXTREME = { temperature: 36, humidity: 80 };

const NOW = at(13);

/** The dew point that gives an hour of `temperature` °C this T+DP sum. */
function dewPointFor(temperature: number, sumF: number): number {
  return (sumF - (temperature * 1.8 + 32) - 32) / 1.8;
}

function hour(time: number, temperature: number, dewPoint = 20): WeatherHour {
  return { at: time, temperature, dewPoint };
}

/** A hot afternoon cooling into the night, and cooler still after
 *  midnight: the next twelve hours from 13:00, as the server sends them. */
const AFTERNOON: WeatherHour[] = [
  hour(at(14), 33, 24),
  hour(at(15), 33, 24),
  hour(at(16), 32, 24),
  hour(at(17), 31, 23),
  hour(at(18), 29, 22),
  hour(at(19), 27, 21),
  hour(at(20), 26, 21),
  hour(at(21), 24, 20),
  hour(at(22), 24, 20),
  hour(at(23), 25, 20),
  hour(at(0, 0, 16), 22, 19),
  hour(at(1, 0, 16), 21, 19),
];

describe("coolestHourAhead", () => {
  it("names today's coolest hour still ahead: the earliest of a tie, never tomorrow's", () => {
    const coolest = coolestHourAhead({ ...HOT, hours: AFTERNOON }, NOW);
    expect(coolest).toEqual(hour(at(21), 24, 20));
    // 24 °C with a dew point of 20: 143 °F against now's 168.
    expect(tdpSumF(HOT)! - (24 * 1.8 + 32 + 20 * 1.8 + 32)).toBeGreaterThan(
      COOLEST_COOLER_BY_F
    );
  });

  it("names it on an extreme day too", () => {
    expect(coolestHourAhead({ ...EXTREME, hours: AFTERNOON }, NOW)?.at).toBe(
      at(21)
    );
  });

  it("names nothing on a mild day, however cool the evening", () => {
    expect(coolestHourAhead({ ...MILD, hours: AFTERNOON }, NOW)).toBeNull();
  });

  it("names nothing for a reading without hours, as a server that predates them sends", () => {
    expect(coolestHourAhead(HOT, NOW)).toBeNull();
    expect(coolestHourAhead({ ...HOT, hours: [] }, NOW)).toBeNull();
    expect(coolestHourAhead(null, NOW)).toBeNull();
  });

  it("names nothing too close to now: an hour must start at least an hour off", () => {
    expect(COOLEST_MIN_LEAD_MS).toBe(60 * 60 * 1000);
    // A storm front: 14:00 is far cooler, every hour after it hot.
    const front = [
      hour(at(14), 24, 18),
      ...AFTERNOON.slice(1).map((h) => ({ ...h, temperature: 33 })),
    ];
    // At 13:00 it starts an hour off: named.
    expect(coolestHourAhead({ ...HOT, hours: front }, at(13))?.at).toBe(at(14));
    // At 13:01 it starts in 59 minutes: too close, and nothing else is
    // cooler, so nothing is named.
    expect(coolestHourAhead({ ...HOT, hours: front }, at(13, 1))).toBeNull();
    // And an hour already begun is never named.
    expect(coolestHourAhead({ ...HOT, hours: front }, at(14, 30))).toBeNull();
  });

  it("names nothing not cooler enough: one band of the table, by the heat rule's own sum", () => {
    const nowSum = tdpSumF(HOT)!;
    const evening = (sumUnder: number) => [
      ...AFTERNOON.slice(0, 6).map((h) => ({ ...h, temperature: 33 })),
      hour(at(20), 28, dewPointFor(28, nowSum - sumUnder)),
    ];
    // 9.9 °F under now: not a band.
    expect(coolestHourAhead({ ...HOT, hours: evening(9.9) }, NOW)).toBeNull();
    // 10.1 °F under now: named.
    expect(coolestHourAhead({ ...HOT, hours: evening(10.1) }, NOW)?.at).toBe(
      at(20)
    );
  });

  it("names nothing whose air is not a whole degree cooler, however dry it turns", () => {
    const nowSum = tdpSumF(HOT)!;
    // 31.5 °C, so dry the sum is 15 °F under now's: the line would say
    // 32 °C against 32 °C now.
    const drier = [
      ...AFTERNOON.slice(0, 6).map((h) => ({ ...h, temperature: 33 })),
      hour(at(20), 31.5, dewPointFor(31.5, nowSum - 15)),
    ];
    expect(coolestHourAhead({ ...HOT, hours: drier }, NOW)).toBeNull();
    // A whole degree cooler, and named.
    drier[6] = hour(at(20), 31, dewPointFor(31, nowSum - 15));
    expect(coolestHourAhead({ ...HOT, hours: drier }, NOW)?.at).toBe(at(20));
  });
});

describe("the coolest hour's line", () => {
  const coolest = hour(at(21), 24, 20);

  it("says when, how cool and against now, on the 24-hour clock", () => {
    expect(coolestHourLine(coolest, 32, "C")).toBe(
      "Coolest at 21:00, 24 °C against 32 °C now."
    );
    expect(coolestHourLine(hour(at(6), 14), 23, "C")).toBe(
      "Coolest at 06:00, 14 °C against 23 °C now."
    );
  });

  it("speaks °F where the device's region reads it", () => {
    // 24 °C is 75.2 °F, 32 °C is 89.6 °F.
    expect(coolestHourLine(coolest, 32, "F")).toBe(
      "Coolest at 21:00, 75 °F against 90 °F now."
    );
  });
});

describe("the temperature unit follows the device's region, not the distance unit", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("is °F in the US and the regions that read °F, °C elsewhere", () => {
    expect(temperatureUnitForLocales(["en-US"])).toBe("F");
    expect(temperatureUnitForLocales(["es-US"])).toBe("F");
    for (const tag of ["en-LR", "my-MM", "en-BS", "en-BZ", "en-KY"])
      expect(temperatureUnitForLocales([tag])).toBe("F");
    for (const tag of ["en-PW", "en-FM", "en-MH"])
      expect(temperatureUnitForLocales([tag])).toBe("F");
    // Run27 (4): the US territories, whose phones send their own region.
    for (const tag of ["en-PR", "es-PR", "en-GU", "en-VI", "en-AS", "en-MP"])
      expect(temperatureUnitForLocales([tag])).toBe("F");
    expect(temperatureUnitForLocales(["en-GB"])).toBe("C");
    expect(temperatureUnitForLocales(["fr-FR"])).toBe("C");
    expect(temperatureUnitForLocales(["de-DE"])).toBe("C");
    expect(temperatureUnitForLocales(["en-CA"])).toBe("C");
    expect(temperatureUnitForLocales(["en-AU"])).toBe("C");
  });

  it("reads the region however the tag is written", () => {
    expect(temperatureUnitForLocales(["en-gb"])).toBe("C");
    expect(temperatureUnitForLocales(["en_US"])).toBe("F");
    expect(temperatureUnitForLocales(["zh-Hant-TW"])).toBe("C");
    expect(temperatureUnitForLocales(["en-US-u-ca-gregory"])).toBe("F");
  });

  it("takes the first tag that names a region, and °C when none does", () => {
    // iOS has sent a bare "en" for UK and Canadian devices: never read
    // as the US.
    expect(temperatureUnitForLocales(["en"])).toBe("C");
    expect(temperatureUnitForLocales(["en", "en-US"])).toBe("F");
    expect(temperatureUnitForLocales(["en-GB", "en-US"])).toBe("C");
    expect(temperatureUnitForLocales([])).toBe("C");
    expect(temperatureUnitForLocales([null, undefined, "", "not a tag!"])).toBe(
      "C"
    );
  });

  it("reads the device: en-GB is °C, en-US is °F, fr-FR is °C", () => {
    restore = setDeviceLanguage("en-GB");
    expect(deviceTemperatureUnit()).toBe("C");
    restore();
    restore = setDeviceLanguage("en-US");
    expect(deviceTemperatureUnit()).toBe("F");
    restore();
    restore = setDeviceLanguage("fr-FR");
    expect(deviceTemperatureUnit()).toBe("C");
    restore();
    // Run27 (4): a phone in Puerto Rico or Guam reads °F.
    restore = setDeviceLanguage("en-PR");
    expect(deviceTemperatureUnit()).toBe("F");
    restore();
    restore = setDeviceLanguage("en-GU");
    expect(deviceTemperatureUnit()).toBe("F");
    restore();
    // A bare language, with the region only in the list.
    restore = setDeviceLanguage("en", ["en", "en-US"]);
    expect(deviceTemperatureUnit()).toBe("F");
  });
});

describe("temperatureLabel", () => {
  it("rounds to the whole degree, spaced, with the true minus", () => {
    expect(temperatureLabel(13.6, "C")).toBe("14 °C");
    expect(temperatureLabel(-3, "C")).toBe("−3 °C");
    expect(temperatureLabel(-0.2, "C")).toBe("0 °C");
    expect(temperatureLabel(-20, "F")).toBe("−4 °F");
    expect(temperatureLabel(100, "F")).toBe("212 °F");
  });
});
