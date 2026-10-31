/** Older clients can call the deployed function even when new builds hide
 * road-routing controls. The release hold must reject those direct calls
 * before Firestore or Mapbox is contacted. */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "tropos-unit-test";
const { planRunningRoute } = require("../index");

describe("Mapbox road-routing release hold", () => {
  it.each([
    { action: "align", waypoints: [{ lat: 51.5, lon: -0.1 }, { lat: 51.51, lon: -0.11 }] },
    { action: "loop", start: { lat: 51.5, lon: -0.1 }, targetKm: 5 },
  ])("rejects a direct $action request from an older Pro client", async (request) => {
    await expect(
      planRunningRoute.run(request, { auth: { uid: "pro-member" } })
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });
});
