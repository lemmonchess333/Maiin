/**
 * Crash reporting: Crashlytics on the phone, nothing on the web, and the
 * JavaScript errors errorReporting catches reaching Crashlytics as
 * non-fatal reports under the signed-in account.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const isNativePlatform = vi.fn(() => false);
vi.mock("@/lib/platform", () => ({
  isNativePlatform: () => isNativePlatform(),
}));
// errorReporting persists critical reports; keep that on the fake.
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const plugin = vi.hoisted(() => ({
  loaded: 0,
  setUserId: vi.fn(async (_: { userId: string }) => {}),
  recordException: vi.fn(async (_: unknown) => {}),
  crash: vi.fn(async (_: { message: string }) => {}),
}));
vi.mock("@capacitor-firebase/crashlytics", () => {
  plugin.loaded += 1;
  return { FirebaseCrashlytics: plugin };
});

import {
  __resetCrashReporting,
  crashReportingStatus,
  recordNonFatal,
  setCrashReportingUser,
  stackFrames,
} from "../crashReporting";
import { captureError, setErrorReportingUid } from "../errorReporting";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const WEBKIT_STACK = [
  "renderMeals@capacitor://localhost/assets/Food-abc123.js:1:48211",
  "@capacitor://localhost/assets/index-def456.js:2:1203",
  "global code@capacitor://localhost/assets/index-def456.js:9:17",
].join("\n");

beforeEach(() => {
  __resetCrashReporting();
  isNativePlatform.mockReturnValue(false);
  plugin.setUserId.mockClear();
  plugin.recordException.mockClear();
});

describe("on the phone", () => {
  beforeEach(() => isNativePlatform.mockReturnValue(true));

  it("records a caught error as a non-fatal with its frames and what caught it", async () => {
    const error = new TypeError("Cannot read properties of undefined");
    error.stack = WEBKIT_STACK;
    captureError(error, "component", { section: "TodayEnergy" });
    await settle();

    expect(plugin.recordException).toHaveBeenCalledWith({
      message:
        "[component in TodayEnergy] TypeError: Cannot read properties of undefined",
      stacktrace: [
        {
          functionName: "renderMeals",
          fileName: "assets/Food-abc123.js:48211",
          lineNumber: 1,
        },
        {
          functionName: "<anonymous>",
          fileName: "assets/index-def456.js:1203",
          lineNumber: 2,
        },
        {
          functionName: "global code",
          fileName: "assets/index-def456.js:17",
          lineNumber: 9,
        },
      ],
    });
    expect(crashReportingStatus()).toBe("active");
  });

  it("files reports under the signed-in account, and under no one after sign-out", async () => {
    setErrorReportingUid("uid-123");
    await settle();
    setErrorReportingUid(null);
    await settle();
    expect(plugin.setUserId.mock.calls).toEqual([
      [{ userId: "uid-123" }],
      [{ userId: "" }],
    ]);
  });

  it("sends an error with no frames it can read without a stack", async () => {
    const error = new Error("no stack");
    error.stack = undefined;
    recordNonFatal(error, "network");
    await settle();
    expect(plugin.recordException).toHaveBeenCalledWith({
      message: "[network] Error: no stack",
    });
  });

  it("never throws when Crashlytics fails", async () => {
    plugin.recordException.mockRejectedValueOnce(new Error("plugin down"));
    expect(() => recordNonFatal(new Error("x"), "error")).not.toThrow();
    await settle();
    expect(crashReportingStatus()).toBe("error");
  });
});

describe("on the web", () => {
  it("does nothing, and never loads the plugin", async () => {
    const loadsBefore = plugin.loaded;
    captureError(new Error("web error"), "component");
    setCrashReportingUser("uid-123");
    await settle();
    expect(plugin.recordException).not.toHaveBeenCalled();
    expect(plugin.setUserId).not.toHaveBeenCalled();
    expect(plugin.loaded).toBe(loadsBefore);
    expect(crashReportingStatus()).toBe("web");
  });
});

describe("stackFrames", () => {
  it("reads a desktop browser's frames as well as WebKit's", () => {
    expect(
      stackFrames(
        [
          "TypeError: x is not a function",
          "    at renderMeals (http://localhost:5173/src/pages/Food.tsx:120:9)",
          "    at http://localhost:5173/src/main.tsx:4:2",
        ].join("\n")
      )
    ).toEqual([
      {
        functionName: "renderMeals",
        fileName: "http://localhost:5173/src/pages/Food.tsx:9",
        lineNumber: 120,
      },
      {
        functionName: "<anonymous>",
        fileName: "http://localhost:5173/src/main.tsx:2",
        lineNumber: 4,
      },
    ]);
  });

  it("keeps at most 50 frames", () => {
    const deep = Array.from(
      { length: 80 },
      (_, i) => `f${i}@capacitor://localhost/assets/a.js:1:${i}`
    ).join("\n");
    expect(stackFrames(deep)).toHaveLength(50);
  });
});
