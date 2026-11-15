/**
 * The phone's motion sensors during a run, for auto-pause (runAutoPause.ts).
 *
 * - **Native iOS:** the app's own MotionActivity plugin
 *   (`ios/App/App/MotionActivityPlugin.swift`, registered by
 *   `TroposBridgeViewController`) passes on CoreMotion's pedometer updates,
 *   its pause and resume events and the activity classifier's answers as
 *   they come, and decides nothing. Starting it the first time asks for
 *   Motion & Fitness (the reason is `NSMotionUsageDescription` in
 *   Info.plist). Refused, or on a phone without the sensor, it sends
 *   `unavailable` and auto-pause keeps its GPS rule.
 * - **Web:** nothing. DeviceMotion has no pedometer or classifier, and
 *   iOS Safari asks for it from a tap; auto-pause keeps its GPS rule there,
 *   as it was.
 * - An older native shell without the plugin rejects the calls, and is the
 *   web's case.
 *
 * Readings stay in memory for the run. Nothing here is stored or sent.
 */
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { isNativePlatform } from "./platform";
import type { MotionActivityKind, MotionSample } from "./runAutoPause";

interface MotionActivityPlugin {
  start(): Promise<unknown>;
  stop(): Promise<void>;
  addListener(
    eventName: "motionSample",
    listener: (sample: unknown) => void
  ): Promise<PluginListenerHandle>;
}

let plugin: MotionActivityPlugin | null = null;
function nativePlugin(): MotionActivityPlugin | null {
  if (!isNativePlatform()) return null;
  plugin ??= registerPlugin<MotionActivityPlugin>("MotionActivity");
  return plugin;
}

const isTime = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value > 0 &&
  value < 8.64e15;

const CONFIDENCE = ["low", "medium", "high"] as const;

/** CoreMotion's activity flags are not exclusive (CMMotionActivity): a
 *  car at a red light is automotive and stationary. Running and walking
 *  come first, as they are what a run is; then a still phone; then a
 *  vehicle or a bike; then CoreMotion's own unknown. All false is movement
 *  it cannot name. */
export function activityKind(flags: {
  stationary: boolean;
  walking: boolean;
  running: boolean;
  automotive: boolean;
  cycling: boolean;
  unknown: boolean;
}): MotionActivityKind {
  if (flags.running) return "running";
  if (flags.walking) return "walking";
  if (flags.stationary) return "stationary";
  if (flags.automotive || flags.cycling) return "other";
  if (flags.unknown) return "unknown";
  return "other";
}

/** What the plugin sent, checked; null for anything malformed, which is no
 *  evidence. */
export function parseMotionSample(raw: unknown): MotionSample | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  switch (value.kind) {
    case "unavailable":
      return { kind: "unavailable" };
    case "steps": {
      const { at, steps, cadence } = value;
      if (!isTime(at)) return null;
      if (typeof steps !== "number" || !Number.isInteger(steps) || steps < 0)
        return null;
      const cadenceOk =
        typeof cadence === "number" && Number.isFinite(cadence) && cadence >= 0;
      if (cadence !== undefined && cadence !== null && !cadenceOk) return null;
      return {
        kind: "steps",
        at,
        steps,
        cadence: cadenceOk ? cadence : null,
      };
    }
    case "stepEvent": {
      const { at, moving } = value;
      if (!isTime(at) || typeof moving !== "boolean") return null;
      return { kind: "stepEvent", at, moving };
    }
    case "activity": {
      const { at, confidence } = value;
      if (!isTime(at)) return null;
      if (
        typeof confidence !== "number" ||
        !Number.isInteger(confidence) ||
        confidence < 0 ||
        confidence > 2
      )
        return null;
      const flags = [
        "stationary",
        "walking",
        "running",
        "automotive",
        "cycling",
        "unknown",
      ] as const;
      if (flags.some((flag) => typeof value[flag] !== "boolean")) return null;
      return {
        kind: "activity",
        at,
        activity: activityKind(
          value as Record<(typeof flags)[number], boolean>
        ),
        confidence: CONFIDENCE[confidence],
      };
    }
    default:
      return null;
  }
}

/**
 * Starts the sensors and hands each reading to `onSample`; the function it
 * resolves with stops them. On the web, or a shell without the plugin, it
 * starts nothing and the stop does nothing.
 */
export async function startRunMotion(
  onSample: (sample: MotionSample) => void
): Promise<() => void> {
  const native = nativePlugin();
  if (!native) return () => {};
  let handle: PluginListenerHandle | null = null;
  try {
    handle = await native.addListener("motionSample", (raw) => {
      const sample = parseMotionSample(raw);
      if (sample) onSample(sample);
    });
    await native.start();
  } catch {
    // An older shell without the plugin: auto-pause keeps its GPS rule.
    void handle?.remove();
    return () => {};
  }
  return () => {
    void handle?.remove();
    native.stop().catch(() => {});
  };
}
