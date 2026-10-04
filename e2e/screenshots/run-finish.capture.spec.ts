/**
 * The run finish screen, before it is saved. RunSummary hydrates from
 * router state, so the spec hands it a finished run the way Run.tsx does:
 * a small loop of GPS points, five kilometre splits and a climb. No
 * device, no GPS rig, and nothing written, since the frame is taken
 * before Save run.
 *
 * The capture rig has no map tiles, so the map shows its unavailable
 * state; the route line and the rest of the page are what the frame is
 * for.
 */
import { test, expect } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { settleImages } from "../helpers/settleImages";
import { settleFullPageHeight } from "../helpers/settleHeight";

test.use({
  viewport: { width: 393, height: 852 },
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

test("the run finish screen leads with the map and the distance", async ({
  page,
}) => {
  test.skip(!emulatorActive, "needs the Firebase emulator");
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = ".firebase-emulator-warning{display:none !important}";
      document.head.appendChild(style);
    });
  });
  await signInAsTestUser(page);

  await page.evaluate(() => {
    const start = Date.now() - 30 * 60 * 1000;
    // A 5 km loop: 60 points on an ellipse around a London park.
    const points = Array.from({ length: 61 }, (_, i) => {
      const a = (i / 60) * 2 * Math.PI;
      const lat = 51.5074 + 0.0072 * Math.sin(a);
      const lon = -0.1278 + 0.0115 * Math.cos(a);
      return {
        lat,
        lon,
        rawLat: lat,
        rawLon: lon,
        altitude: 20 + 15 * Math.sin(a * 2),
        accuracy: 5,
        speed: 2.8,
        timestamp: start + i * 30_000,
      };
    });
    const paces = [372, 364, 352, 358, 354];
    const splits = paces.map((paceSeconds, i) => ({
      km: i + 1,
      time: paceSeconds,
      pace: `${Math.floor(paceSeconds / 60)}:${String(paceSeconds % 60).padStart(2, "0")}`,
      paceSeconds,
      elevationGain: 6,
      elevationLoss: 6,
    }));
    history.pushState(
      {
        usr: {
          points,
          distance: 5000,
          elapsed: 1800,
          splits,
          elevationGain: 30,
          runConfig: { activityType: "tempo" },
        },
        key: "e2e-run-finish",
        idx: (history.state?.idx ?? 0) + 1,
      },
      "",
      "/Maiin/run-summary"
    );
    window.dispatchEvent(
      new PopStateEvent("popstate", { state: history.state })
    );
  });

  await expect(
    page.getByRole("button", { name: "Save run", exact: true })
  ).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  for (const dark of [false, true]) {
    await page.evaluate(
      (value) => document.documentElement.classList.toggle("dark", value),
      dark
    );
    await settleImages(page);
    await settleFullPageHeight(page);
    await page.screenshot({
      path: `screenshots/run-finish-${dark ? "dark" : "light"}.png`,
      animations: "disabled",
      fullPage: true,
    });
  }
});
