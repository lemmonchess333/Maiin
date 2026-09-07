import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("routes a real callable SDK request to loopback in emulator mode", async () => {
  vi.stubEnv("VITE_USE_EMULATORS", "true");
  const fetcher = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ data: { ok: true } }), {
      headers: { "Content-Type": "application/json" },
    })
  );
  vi.stubGlobal("fetch", fetcher);
  const { functions } = await import("../firebase");
  const { httpsCallable } = await import("firebase/functions");
  await expect(
    httpsCallable(functions, "applyProgramCommand")({})
  ).resolves.toMatchObject({ data: { ok: true } });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][0]).toBe(
    "http://127.0.0.1:5001/test-project/us-central1/applyProgramCommand"
  );
});
