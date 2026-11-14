/**
 * Phone side of a Bluetooth heart rate sensor: a chest strap or an armband
 * speaking the standard Heart Rate Service (0x180D), read through the app's
 * own `HeartRateSensor` plugin (`ios/App/App/HeartRateSensorPlugin.swift`,
 * CoreBluetooth, no third-party SDK).
 *
 * The native half finds, pairs and connects to a sensor, forwards each Heart
 * Rate Measurement (0x2A37) as raw bytes, and keeps a run's readings in
 * memory while one is named (`startHeartRateSensorSession`), so a web view
 * reloaded mid-run can recover them at review. It never writes a reading to
 * disk. This module parses the bytes (`heartRateMeasurement.ts`, the one
 * parser) and hands back beats.
 *
 * Web and an older native shell have no such plugin: every call here
 * answers "not available" and never throws, so Settings can still explain
 * the sensor and a run carries on without it. Not behind the connected
 * training gate: a sensor needs no Watch.
 */
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { isNativePlatform } from "./platform";
import {
  parseHeartRateMeasurement,
  usableHeartRate,
} from "./heartRateMeasurement";
import type { HeartRateSample } from "./hrZones";

export type SensorAuthorization =
  "notDetermined" | "allowed" | "denied" | "restricted";

/** CoreBluetooth's manager state; "unknown" until Tropos has asked for
 *  Bluetooth, since asking is what shows iOS's permission prompt. */
export type SensorRadio =
  | "unknown"
  | "resetting"
  | "unsupported"
  | "unauthorized"
  | "poweredOff"
  | "poweredOn";

export type SensorConnection = "idle" | "connecting" | "connected";

export interface PairedSensor {
  id: string;
  name: string;
}

export interface HeartRateSensorStatus {
  /** Whether this app can use a sensor at all: false on web. */
  available: boolean;
  authorization: SensorAuthorization;
  bluetooth: SensorRadio;
  paired: PairedSensor | null;
  connection: SensorConnection;
  scanning: boolean;
}

export const UNAVAILABLE_SENSOR_STATUS: HeartRateSensorStatus = {
  available: false,
  authorization: "notDetermined",
  bluetooth: "unknown",
  paired: null,
  connection: "idle",
  scanning: false,
};

/** One notification as native forwards it. */
interface NativeSensorReading {
  /** Unique within the app's process: a boot token and a sequence. */
  id: string;
  /** Unix epoch ms at which the phone received it. */
  at: number;
  bytes: number[];
}

interface HeartRateSensorPlugin {
  getStatus(): Promise<Partial<HeartRateSensorStatus>>;
  startScan(): Promise<void>;
  stopScan(): Promise<void>;
  pair(options: { id: string }): Promise<Partial<HeartRateSensorStatus>>;
  forget(): Promise<Partial<HeartRateSensorStatus>>;
  setPreview(options: { on: boolean }): Promise<void>;
  startSession(options: { sessionId: string }): Promise<void>;
  stopSession(): Promise<void>;
  getSessionReadings(options: {
    sessionId: string;
  }): Promise<{ readings: NativeSensorReading[] }>;
  clearSessions(options: { sessionId?: string }): Promise<void>;
  openSettings(): Promise<void>;
  addListener(
    eventName: "sensorFound" | "statusChanged" | "reading",
    listener: (event: unknown) => void
  ): Promise<PluginListenerHandle>;
}

// Held in a variable, never resolved from a promise: a plugin answers
// `then` with a native call (CLAUDE.md, Common Gotchas).
let plugin: HeartRateSensorPlugin | null = null;
function nativePlugin(): HeartRateSensorPlugin | null {
  if (!isNativePlatform()) return null;
  if (!plugin)
    plugin = registerPlugin<HeartRateSensorPlugin>("HeartRateSensor");
  return plugin;
}

const AUTHORIZATIONS: readonly SensorAuthorization[] = [
  "notDetermined",
  "allowed",
  "denied",
  "restricted",
];
const RADIOS: readonly SensorRadio[] = [
  "unknown",
  "resetting",
  "unsupported",
  "unauthorized",
  "poweredOff",
  "poweredOn",
];
const CONNECTIONS: readonly SensorConnection[] = [
  "idle",
  "connecting",
  "connected",
];

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function pairedSensor(value: unknown): PairedSensor | null {
  if (!value || typeof value !== "object") return null;
  const { id, name } = value as Partial<PairedSensor>;
  if (typeof id !== "string" || !id) return null;
  return { id, name: typeof name === "string" && name ? name : "Sensor" };
}

/** The native answer, read field by field; anything unreadable is the
 *  safe value. */
function readSensorStatus(value: unknown): HeartRateSensorStatus {
  if (!value || typeof value !== "object") return UNAVAILABLE_SENSOR_STATUS;
  const raw = value as Record<string, unknown>;
  return {
    available: raw.available === true,
    authorization: oneOf(raw.authorization, AUTHORIZATIONS, "notDetermined"),
    bluetooth: oneOf(raw.bluetooth, RADIOS, "unknown"),
    paired: pairedSensor(raw.paired),
    connection: oneOf(raw.connection, CONNECTIONS, "idle"),
    scanning: raw.scanning === true,
  };
}

export async function getHeartRateSensorStatus(): Promise<HeartRateSensorStatus> {
  const native = nativePlugin();
  if (!native) return UNAVAILABLE_SENSOR_STATUS;
  try {
    return readSensorStatus(await native.getStatus());
  } catch {
    return UNAVAILABLE_SENSOR_STATUS;
  }
}

async function listen(
  eventName: "sensorFound" | "statusChanged" | "reading",
  handler: (event: unknown) => void
): Promise<() => void> {
  const native = nativePlugin();
  if (!native) return () => {};
  try {
    const listener = await native.addListener(eventName, handler);
    return () => {
      void listener.remove();
    };
  } catch {
    return () => {};
  }
}

export function subscribeHeartRateSensorStatus(
  handler: (status: HeartRateSensorStatus) => void
): Promise<() => void> {
  return listen("statusChanged", (event) => handler(readSensorStatus(event)));
}

/**
 * Look for sensors nearby (and any already connected to this iPhone).
 * Asking for the first time shows iOS's Bluetooth prompt. The returned
 * function ends the search.
 */
export async function scanForHeartRateSensors(
  onFound: (sensor: PairedSensor) => void
): Promise<() => void> {
  const native = nativePlugin();
  if (!native) return () => {};
  const unlisten = await listen("sensorFound", (event) => {
    const sensor = pairedSensor(event);
    if (sensor) onFound(sensor);
  });
  try {
    await native.startScan();
  } catch {
    unlisten();
    return () => {};
  }
  return () => {
    unlisten();
    void native.stopScan().catch(() => {});
  };
}

/** Remember the sensor on this iPhone and connect to it. */
export async function pairHeartRateSensor(
  id: string
): Promise<HeartRateSensorStatus | null> {
  const native = nativePlugin();
  if (!native || !id) return null;
  try {
    return readSensorStatus(await native.pair({ id }));
  } catch {
    return null;
  }
}

export async function forgetHeartRateSensor(): Promise<HeartRateSensorStatus | null> {
  const native = nativePlugin();
  if (!native) return null;
  try {
    return readSensorStatus(await native.forget());
  } catch {
    return null;
  }
}

/** Keep the paired sensor connected while Settings shows its reading. */
export async function previewHeartRateSensor(on: boolean): Promise<void> {
  const native = nativePlugin();
  if (!native) return;
  try {
    await native.setPreview({ on });
  } catch {
    // A preview is a convenience; nothing waits on it.
  }
}

export async function openHeartRateSensorSettings(): Promise<void> {
  const native = nativePlugin();
  if (!native) return;
  try {
    await native.openSettings();
  } catch {
    // Settings is the person's to open; nothing else depends on it.
  }
}

/** A reading as a beat, or null when its bytes say nothing usable. */
function sensorReadingSample(value: unknown): HeartRateSample | null {
  if (!value || typeof value !== "object") return null;
  const { id, at, bytes } = value as Partial<NativeSensorReading>;
  if (typeof id !== "string" || !id) return null;
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  if (!Array.isArray(bytes) || !bytes.every((b) => Number.isInteger(b)))
    return null;
  const bpm = usableHeartRate(parseHeartRateMeasurement(bytes));
  if (bpm == null) return null;
  return { id: `ble:${id}`, at, bpm, source: "bluetooth" };
}

/** Live beats from the paired sensor, whether or not a run is named. */
export function subscribeHeartRateSensorReadings(
  handler: (sample: HeartRateSample) => void
): Promise<() => void> {
  return listen("reading", (event) => {
    const sample = sensorReadingSample(event);
    if (sample) handler(sample);
  });
}

/** Connect for a run and keep its readings until the run is saved or
 *  discarded. Resolves false when there is no plugin. */
export async function startHeartRateSensorSession(
  sessionId: string
): Promise<boolean> {
  const native = nativePlugin();
  if (!native || !sessionId) return false;
  try {
    await native.startSession({ sessionId });
    return true;
  } catch {
    return false;
  }
}

/** Stop naming readings for a run. Its kept readings stay for review. */
export async function stopHeartRateSensorSession(): Promise<void> {
  const native = nativePlugin();
  if (!native) return;
  try {
    await native.stopSession();
  } catch {
    // The run carries on; nothing here can stop it.
  }
}

/** The readings native kept for a run, parsed, for the summary. */
export async function getHeartRateSensorSessionSamples(
  sessionId: string
): Promise<HeartRateSample[]> {
  const native = nativePlugin();
  if (!native || !sessionId) return [];
  try {
    const { readings } = await native.getSessionReadings({ sessionId });
    if (!Array.isArray(readings)) return [];
    return readings
      .map(sensorReadingSample)
      .filter((sample): sample is HeartRateSample => sample !== null);
  } catch {
    return [];
  }
}

/** Drop a run's kept readings, or every run's with no id (account change). */
export async function clearHeartRateSensorSessions(
  sessionId?: string
): Promise<void> {
  const native = nativePlugin();
  if (!native) return;
  try {
    await native.clearSessions(sessionId ? { sessionId } : {});
  } catch {
    // Readings live in memory only; the process's end clears them anyway.
  }
}
