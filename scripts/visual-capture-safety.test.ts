import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// Local pure helper: no Admin SDK, browser, network or emulator process.
// @ts-expect-error Standalone Node .mjs harness is outside the TS app project.
import { assertVisualCaptureEnvironment } from "./visual-capture-safety.mjs";

const safe = {
  E2E_AUTH_EMULATOR: "1",
  GCLOUD_PROJECT: "demo-tropos",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
};

describe("visual capture destination guard", () => {
  it("accepts the workflow's disposable local project", () => {
    expect(() => assertVisualCaptureEnvironment(safe)).not.toThrow();
  });
  it("accepts localhost aliases", () => {
    expect(() =>
      assertVisualCaptureEnvironment({
        ...safe,
        FIREBASE_AUTH_EMULATOR_HOST: "localhost:9099",
        FIRESTORE_EMULATOR_HOST: "localhost:8080",
      })
    ).not.toThrow();
  });
  it.each(Object.keys(safe))("rejects a missing %s", (key) => {
    expect(() =>
      assertVisualCaptureEnvironment({ ...safe, [key]: undefined })
    ).toThrow();
  });
  it.each([
    ["E2E_AUTH_EMULATOR", "true"],
    ["GCLOUD_PROJECT", "adaptive-fitness-af8bb"],
    ["GCLOUD_PROJECT", "demo-other"],
    ["FIREBASE_AUTH_EMULATOR_HOST", "example.com:9099"],
    ["FIRESTORE_EMULATOR_HOST", "example.com:8080"],
    ["FIRESTORE_EMULATOR_HOST", "127.0.0.1:8081"],
    ["FIRESTORE_EMULATOR_HOST", "localhost.example.com:8080"],
    ["FIRESTORE_EMULATOR_HOST", "http://127.0.0.1:8080"],
  ])("rejects %s=%s", (key, value) => {
    expect(() =>
      assertVisualCaptureEnvironment({ ...safe, [key]: value })
    ).toThrow();
  });
  it("calls the guard before any Admin initialization or browser launch", () => {
    const source = readFileSync(
      new URL("./visual-capture.mjs", import.meta.url),
      "utf8"
    );
    const gate = source.indexOf("assertVisualCaptureEnvironment();");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(source.indexOf("initializeApp({"));
    expect(gate).toBeLessThan(source.indexOf("chromium.launch("));
  });
});
