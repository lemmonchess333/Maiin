/**
 * The Heart Rate Measurement characteristic (0x2A37) read byte by byte, on
 * the layouts the Bluetooth SIG defines: GATT Specification Supplement
 * §3.126 (fields), §3.126.1 (flags), §3.126.2 (RR-intervals in 1/1024 s),
 * §2.4 (little endian).
 */
import { describe, it, expect } from "vitest";
import {
  parseHeartRateMeasurement,
  usableHeartRate,
} from "../heartRateMeasurement";

describe("parseHeartRateMeasurement — the value's format (flags bit 0)", () => {
  it("reads a uint8 heart rate when bit 0 is 0", () => {
    // Flags 0x00, 72 bpm.
    expect(parseHeartRateMeasurement([0x00, 0x48])).toEqual({
      bpm: 72,
      contact: "unsupported",
      rrIntervalsMs: [],
    });
  });

  it("reads a uint16 heart rate, low byte first, when bit 0 is 1", () => {
    // 0x0048 = 72 and 0x012C = 300: the high byte counts.
    expect(parseHeartRateMeasurement([0x01, 0x48, 0x00])?.bpm).toBe(72);
    expect(parseHeartRateMeasurement([0x01, 0x2c, 0x01])?.bpm).toBe(300);
  });

  it("reads the top of the uint8 range as itself, not as a sign", () => {
    expect(parseHeartRateMeasurement([0x00, 0xff])?.bpm).toBe(255);
  });

  it("is null when the bytes cannot hold the value the flags promise", () => {
    expect(parseHeartRateMeasurement([])).toBeNull();
    expect(parseHeartRateMeasurement([0x00])).toBeNull();
    expect(parseHeartRateMeasurement([0x01, 0x48])).toBeNull();
  });
});

describe("parseHeartRateMeasurement — sensor contact (flags bits 1 and 2)", () => {
  it("says detected when supported and touching skin", () => {
    expect(parseHeartRateMeasurement([0x06, 0x8c])?.contact).toBe("detected");
  });

  it("says lost when supported and not touching skin", () => {
    expect(parseHeartRateMeasurement([0x04, 0x8c])?.contact).toBe("lost");
  });

  it("says unsupported when the sensor cannot tell", () => {
    expect(parseHeartRateMeasurement([0x00, 0x8c])?.contact).toBe(
      "unsupported"
    );
    // Bit 1 without bit 2 is not a claim of contact.
    expect(parseHeartRateMeasurement([0x02, 0x8c])?.contact).toBe(
      "unsupported"
    );
  });
});

describe("parseHeartRateMeasurement — Energy Expended and RR-intervals (bits 3 and 4)", () => {
  it("reads one RR-interval in 1/1024 s as milliseconds", () => {
    // 0x0400 = 1024/1024 s = 1000 ms.
    expect(
      parseHeartRateMeasurement([0x10, 0x3c, 0x00, 0x04])?.rrIntervalsMs
    ).toEqual([1000]);
  });

  it("reads several RR-intervals after a uint16 value, oldest first", () => {
    // 0x039A = 922 -> 900 ms; 0x0320 = 800 -> 781 ms; 0x0300 = 768 -> 750 ms.
    expect(
      parseHeartRateMeasurement([
        0x17, 0x50, 0x00, 0x9a, 0x03, 0x20, 0x03, 0x00, 0x03,
      ])
    ).toEqual({ bpm: 80, contact: "detected", rrIntervalsMs: [900, 781, 750] });
  });

  it("skips Energy Expended to reach the RR-intervals", () => {
    // Energy Expended 0x0010 sits between the value and the intervals.
    expect(
      parseHeartRateMeasurement([0x18, 0x50, 0x10, 0x00, 0x00, 0x04])
    ).toEqual({ bpm: 80, contact: "unsupported", rrIntervalsMs: [1000] });
  });

  it("is null when Energy Expended is promised and cut short", () => {
    expect(parseHeartRateMeasurement([0x08, 0x50, 0x10])).toBeNull();
  });

  it("keeps the heart rate when a trailing byte cannot make an interval", () => {
    expect(
      parseHeartRateMeasurement([0x10, 0x50, 0x00, 0x04, 0x01])
    ).toMatchObject({ bpm: 80, rrIntervalsMs: [1000] });
  });

  it("reads no intervals when bit 4 is clear, whatever follows", () => {
    expect(
      parseHeartRateMeasurement([0x00, 0x50, 0x00, 0x04])?.rrIntervalsMs
    ).toEqual([]);
  });

  it("ignores the reserved bits 5 to 7", () => {
    expect(parseHeartRateMeasurement([0xe0, 0x50])).toEqual({
      bpm: 80,
      contact: "unsupported",
      rrIntervalsMs: [],
    });
  });
});

describe("usableHeartRate — what Tropos reads as a beat", () => {
  it("takes a reading in range with contact detected or unknown", () => {
    expect(usableHeartRate(parseHeartRateMeasurement([0x06, 0x8c]))).toBe(140);
    expect(usableHeartRate(parseHeartRateMeasurement([0x00, 0x8c]))).toBe(140);
  });

  it("refuses a reading taken with the strap off the skin", () => {
    expect(usableHeartRate(parseHeartRateMeasurement([0x04, 0x8c]))).toBeNull();
  });

  it("refuses 0, a value under 30 and one over 250", () => {
    expect(usableHeartRate(parseHeartRateMeasurement([0x00, 0x00]))).toBeNull();
    expect(usableHeartRate(parseHeartRateMeasurement([0x00, 29]))).toBeNull();
    expect(usableHeartRate(parseHeartRateMeasurement([0x00, 30]))).toBe(30);
    expect(usableHeartRate(parseHeartRateMeasurement([0x00, 250]))).toBe(250);
    expect(usableHeartRate(parseHeartRateMeasurement([0x00, 251]))).toBeNull();
    expect(usableHeartRate(null)).toBeNull();
  });
});
