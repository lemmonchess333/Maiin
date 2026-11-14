/**
 * The Bluetooth Heart Rate Measurement characteristic (0x2A37), read from
 * the bytes a chest strap or an armband notifies.
 *
 * Every sensor that speaks the standard Heart Rate Service (0x180D) sends
 * this one shape, which is why a strap of any brand can feed Tropos. The
 * layout is the Bluetooth SIG's:
 *
 *   - GATT Specification Supplement §3.126 (Table 3.215): a Flags byte, then
 *     the heart rate as a uint8 or a uint16 in beats per minute, then an
 *     optional Energy Expended uint16, then zero or more RR-intervals,
 *     each a uint16.
 *   - §3.126.1 (Table 3.216), the Flags: bit 0 the value's format (0 is
 *     uint8, 1 is uint16), bit 1 sensor contact detected, bit 2 sensor
 *     contact supported, bit 3 Energy Expended present, bit 4 RR-intervals
 *     present, bits 5 to 7 reserved for future use.
 *   - §3.126.2: "Each RR-Interval value is represented by a uint16 with
 *     1/1024 second as the unit."
 *   - §2.4: "All fields in a characteristic or descriptor are little endian
 *     unless otherwise stated."
 *   - Heart Rate Service 1.0 §3.1.1.5: the measurement is notified about
 *     once a second; §3.1 allows up to 8 or 9 RR-intervals in one.
 *
 * Energy Expended is skipped, never read: Tropos's energy figures stay its
 * own (connected training proposal, heart-rate rule 5). Reserved flag bits
 * are ignored, so a sensor built to a later revision still reads.
 *
 * Pure: no plugin, no React. The native half forwards the raw bytes and this
 * is the one parser, so its tests are the parser's tests.
 */

export type SensorContact = "detected" | "lost" | "unsupported";

export interface HeartRateMeasurement {
  bpm: number;
  /** Bits 1 and 2: whether the strap is touching skin, when it can say. */
  contact: SensorContact;
  /** Beat-to-beat intervals in milliseconds, oldest first. */
  rrIntervalsMs: number[];
}

const FORMAT_UINT16 = 0x01;
const CONTACT_DETECTED = 0x02;
const CONTACT_SUPPORTED = 0x04;
const ENERGY_EXPENDED = 0x08;
const RR_INTERVALS = 0x10;

/**
 * The measurement in `bytes`, or null when the bytes are too short for the
 * fields their flags promise. A trailing odd byte after whole RR-intervals
 * is dropped rather than failing the heart rate before it.
 */
export function parseHeartRateMeasurement(
  bytes: ArrayLike<number>
): HeartRateMeasurement | null {
  const at = (i: number): number => bytes[i] & 0xff;
  if (!bytes || bytes.length < 2) return null;
  const flags = at(0);
  let offset = 1;
  let bpm: number;
  if (flags & FORMAT_UINT16) {
    if (bytes.length < 3) return null;
    bpm = at(1) | (at(2) << 8);
    offset = 3;
  } else {
    bpm = at(1);
    offset = 2;
  }
  if (flags & ENERGY_EXPENDED) {
    if (bytes.length < offset + 2) return null;
    offset += 2;
  }
  const rrIntervalsMs: number[] = [];
  if (flags & RR_INTERVALS) {
    for (; offset + 1 < bytes.length; offset += 2) {
      const raw = at(offset) | (at(offset + 1) << 8);
      rrIntervalsMs.push(Math.round((raw * 1000) / 1024));
    }
  }
  const contact: SensorContact = !(flags & CONTACT_SUPPORTED)
    ? "unsupported"
    : flags & CONTACT_DETECTED
      ? "detected"
      : "lost";
  return { bpm, contact, rrIntervalsMs };
}

/** The live range Tropos reads as a heart rate, as for the Watch's beats. */
export const MIN_READING_BPM = 30;
export const MAX_READING_BPM = 250;

/**
 * The bpm to use from a measurement, or null. A strap that says it has lost
 * contact with the skin is not measuring a heart (many then send 0 or the
 * last value), and a value outside 30 to 250 is not a runner's heart rate.
 */
export function usableHeartRate(
  measurement: HeartRateMeasurement | null
): number | null {
  if (!measurement || measurement.contact === "lost") return null;
  const { bpm } = measurement;
  if (!Number.isFinite(bpm) || bpm < MIN_READING_BPM || bpm > MAX_READING_BPM)
    return null;
  return bpm;
}
