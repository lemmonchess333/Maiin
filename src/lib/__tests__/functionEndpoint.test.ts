import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

it("keeps food requests inside the emulator project", async () => {
  vi.stubEnv("VITE_USE_EMULATORS", "true");
  const { functionEndpoint } = await import("../functionEndpoint");
  expect(functionEndpoint("analyzeFood")).toBe(
    "http://127.0.0.1:5001/test-project/us-central1/analyzeFood"
  );
  expect(functionEndpoint("analyzeFoodText")).toBe(
    "http://127.0.0.1:5001/test-project/us-central1/analyzeFoodText"
  );
});

it("uses the configured project in cloud builds", async () => {
  vi.stubEnv("VITE_USE_EMULATORS", "false");
  const { functionEndpoint } = await import("../functionEndpoint");
  expect(functionEndpoint("analyzeFood")).toBe(
    "https://us-central1-test-project.cloudfunctions.net/analyzeFood"
  );
});
