import type { DateSource } from "./date-parser";
import { chromium } from "@playwright/test";

async function renderSource(
  source: DateSource
): Promise<{ html: string; url: string }> {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.RACE_BROWSER_EXECUTABLE_PATH
      ? { executablePath: process.env.RACE_BROWSER_EXECUTABLE_PATH }
      : {}),
  });
  try {
    const context = await browser.newContext({
      acceptDownloads: false,
      serviceWorkers: "block",
    });
    const hosts = new Set([
      new URL(source.url).hostname,
      ...(source.allowedHosts ?? []),
    ]);
    const page = await context.newPage();
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (
        request.isNavigationRequest() &&
        request.frame() === page.mainFrame()
      ) {
        const url = new URL(request.url());
        if (url.protocol !== "https:" || !hosts.has(url.hostname))
          return route.abort();
      }
      return route.continue();
    });
    const response = await page.goto(source.url, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    if (!response?.ok())
      throw new Error(
        "Official browser source returned HTTP " + response?.status()
      );
    await page
      .locator(source.selector!)
      .first()
      .waitFor({ state: "attached", timeout: 20_000 });
    const url = new URL(page.url());
    if (url.hostname !== new URL(source.url).hostname)
      throw new Error("Official event page has not loaded");
    const html = await page.content();
    if (Buffer.byteLength(html) > 5_000_000)
      throw new Error("Source exceeds size limit");
    return { html, url: url.href };
  } finally {
    await browser.close();
  }
}

export async function fetchSource(
  source: DateSource
): Promise<{ html: string; url: string }> {
  if (source.render) return renderSource(source);
  let url = source.url;
  const hosts = new Set([
    new URL(url).hostname,
    ...(source.allowedHosts ?? []),
  ]);
  for (let redirects = 0; redirects < 4; redirects++) {
    const target = new URL(url);
    if (target.protocol !== "https:" || !hosts.has(target.hostname))
      throw new Error("Unreviewed source redirect");
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "User-Agent": "TroposRaceDates/1.0 (official race date check)",
        Accept: "text/html",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Missing redirect location");
      url = new URL(location, url).href;
      continue;
    }
    if (!response.ok)
      throw new Error(`Official site returned HTTP ${response.status}`);
    if (!response.headers.get("content-type")?.includes("text/html"))
      throw new Error("Source is not HTML");
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 5_000_000) throw new Error("Source exceeds size limit");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    return { html: Buffer.concat(chunks).toString("utf8"), url };
  }
  throw new Error("Too many source redirects");
}
