import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

// Exercise the shipped policy in Chromium, with no App Check tokens or
// third-party traffic. All resources are synthetic and intercepted locally.
test.use({ bypassCSP: false });

const html = readFileSync("index.html", "utf8");
const meta = html.match(
  /<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/
)?.[0];
if (!meta) throw new Error("Production CSP meta tag is missing");

test("App Check resources load while unrelated Google scripts remain blocked", async ({
  page,
}) => {
  const requested: string[] = [];
  const api = "https://www.google.com/recaptcha/api.js";
  const frame = "https://www.google.com/recaptcha/api2/anchor";
  const secondaryFrame = "https://recaptcha.google.com/recaptcha/api2/anchor";
  const connect = "https://www.google.com/recaptcha/api2/reload";
  const unrelated = "https://www.google.com/unrelated.js";
  const fixture = "http://localhost:4173/Maiin/security-csp-fixture";

  await page.route("**/*", async (route) => {
    const url = route.request().url();
    requested.push(url);
    if (url === fixture) {
      await route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><head>${meta}</head><body></body></html>`,
      });
    } else if (url === api || url === unrelated) {
      await route.fulfill({
        contentType: "application/javascript",
        body: "document.documentElement.dataset.recaptchaProbe = 'loaded';",
      });
    } else if (url === frame || url === secondaryFrame) {
      await route.fulfill({
        contentType: "text/html",
        body: "<p>synthetic frame</p>",
      });
    } else if (url === connect) {
      await route.fulfill({
        contentType: "text/plain",
        body: "synthetic-response",
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    } else {
      await route.abort();
    }
  });

  await page.goto(fixture);
  const outcome = await page.evaluate(
    async ({ api, frame, secondaryFrame, connect, unrelated }) => {
      const loadScript = (url: string) =>
        new Promise<string>((resolve) => {
          const script = document.createElement("script");
          script.onload = () => resolve("loaded");
          script.onerror = () => resolve("blocked");
          script.src = url;
          document.head.append(script);
        });
      const allowed = await loadScript(api);
      const blocked = await loadScript(unrelated);
      for (const src of [frame, secondaryFrame]) {
        const iframe = document.createElement("iframe");
        iframe.src = src;
        document.body.append(iframe);
      }
      const response = await fetch(connect).then((r) => r.text());
      return {
        allowed,
        blocked,
        response,
        marker: document.documentElement.dataset.recaptchaProbe,
      };
    },
    { api, frame, secondaryFrame, connect, unrelated }
  );

  expect(outcome).toEqual({
    allowed: "loaded",
    blocked: "blocked",
    response: "synthetic-response",
    marker: "loaded",
  });
  await expect
    .poll(() => page.frames().map((f) => f.url()))
    .toEqual(expect.arrayContaining([frame, secondaryFrame]));
  expect(requested).toEqual(
    expect.arrayContaining([api, frame, secondaryFrame, connect])
  );
  expect(requested).not.toContain(unrelated);
});
