/**
 * Crash reporting on the phone: Firebase Crashlytics, through the
 * `@capacitor-firebase/crashlytics` plugin (the owner's call).
 *
 * - **Native.** The SDK catches native crashes by itself once the plugin
 *   has configured Firebase. This module adds what it cannot see, the
 *   app's own JavaScript errors, as non-fatal reports, and ties both to
 *   the signed-in account's uid (never a name or an email), so a support
 *   request finds its crashes. The release workflow uploads the symbol
 *   files a native crash needs to be read.
 * - **Web.** Crashlytics has no web SDK, and this module does nothing
 *   there. The web build's reports are the Firestore ones
 *   `errorReporting.ts` already writes, read on /diagnostics: that build
 *   is the preview surface, and a second vendor for it was not worth its
 *   cost.
 *
 * The plugin is loaded by dynamic import, so the web bundle never carries
 * it. Nothing here throws: reporting must not take down what it reports.
 */
import type { StackFrame } from "@capacitor-firebase/crashlytics";
import { isNativePlatform } from "./platform";
import { logger } from "./logger";

type Crashlytics =
  (typeof import("@capacitor-firebase/crashlytics"))["FirebaseCrashlytics"];

/** Why crash reports are (or are not) reaching Crashlytics, for the
 *  Diagnostics page. */
export type CrashReportingStatus =
  | "web" // no Crashlytics: the Firestore reports are the web's
  | "pending" // native, plugin not loaded yet
  | "active" // native, the plugin answered
  | "error"; // native, the plugin failed to load or answer

let plugin: Promise<Crashlytics | null> | null = null;
let status: CrashReportingStatus = "pending";

function crashlytics(): Promise<Crashlytics | null> {
  if (!isNativePlatform()) {
    status = "web";
    return Promise.resolve(null);
  }
  plugin ??= import("@capacitor-firebase/crashlytics").then(
    (mod) => mod.FirebaseCrashlytics,
    (err: unknown) => {
      status = "error";
      logger.warn("[Crashlytics] plugin failed to load:", err);
      return null;
    }
  );
  return plugin;
}

async function call(
  request: (c: Crashlytics) => Promise<unknown>
): Promise<void> {
  try {
    const c = await crashlytics();
    if (!c) return;
    await request(c);
    status = "active";
  } catch (err) {
    status = "error";
    logger.warn("[Crashlytics] call failed:", err);
  }
}

export function crashReportingStatus(): CrashReportingStatus {
  return isNativePlatform() ? status : "web";
}

/** Ties the phone's crash reports to this account, or to no one. */
export function setCrashReportingUser(uid: string | null): void {
  void call((c) => c.setUserId({ userId: uid ?? "" }));
}

const WEBKIT_FRAME = /^(.*?)@(.+):(\d+):(\d+)$/;
const V8_FRAME = /^at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/;
const MAX_FRAMES = 50;

/**
 * An error's frames as Crashlytics takes them. The WebKit form
 * (`fn@url:line:col`) is the phone's; the V8 form (`at fn (url:line:col)`)
 * is a desktop browser's. A frame carries a line and no column, and a
 * minified bundle is a few very long lines, so the column rides on the
 * file name: it is the part that finds the code.
 */
export function stackFrames(stack: string | undefined): StackFrame[] {
  const frames: StackFrame[] = [];
  for (const raw of (stack ?? "").split("\n")) {
    const line = raw.trim();
    const match = WEBKIT_FRAME.exec(line) ?? V8_FRAME.exec(line);
    if (!match) continue;
    const [, fn, url, lineNumber, column] = match;
    frames.push({
      functionName: fn || "<anonymous>",
      fileName: `${url.replace(/^capacitor:\/\/localhost\//, "")}:${column}`,
      lineNumber: Number(lineNumber),
    });
    if (frames.length === MAX_FRAMES) break;
  }
  return frames;
}

/** A JavaScript error as a non-fatal report, with what caught it. */
export function recordNonFatal(
  error: Error,
  type: string,
  context?: Record<string, unknown>
): void {
  void call((c) => {
    const where =
      typeof context?.section === "string" ? ` in ${context.section}` : "";
    const frames = stackFrames(error.stack);
    return c.recordException({
      message: `[${type}${where}] ${error.name}: ${error.message}`,
      ...(frames.length > 0 && { stacktrace: frames }),
    });
  });
}

/** Diagnostics only: a real native crash, to prove a report arrives. */
export function sendTestCrash(): void {
  void call((c) => c.crash({ message: "Test crash from Diagnostics" }));
}

/** Test-only: forget the loaded plugin between cases. */
export function __resetCrashReporting(): void {
  plugin = null;
  status = "pending";
}
