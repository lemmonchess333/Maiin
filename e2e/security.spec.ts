import { test, expect } from "@playwright/test";
import { isInsecureHttpResource } from "./helpers/resourceSecurity";

test.describe("Security & CSP", () => {
  test("Content-Security-Policy meta tag exists", async ({ page }) => {
    await page.goto("");
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  test("CSP allows required script sources", async ({ page }) => {
    await page.goto("");
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    expect(csp).toContain("script-src 'self'");
    // The app loads no Stripe script and makes no Stripe request (Sub4),
    // so no Stripe host is allowed anywhere in the policy.
    expect(csp).not.toContain("stripe.com");
  });

  test("CSP allows required connect sources", async ({ page }) => {
    await page.goto("");
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    expect(csp).toContain("https://*.googleapis.com");
    expect(csp).toContain("https://*.firebaseio.com");
    expect(csp).toContain("https://*.cloudfunctions.net");
    expect(csp).toContain("wss://*.firebaseio.com");
  });

  test("CSP restricts frame sources to Firebase sign-in", async ({ page }) => {
    await page.goto("");
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    expect(csp).toContain("frame-src https://*.firebaseapp.com");
  });

  test("CSP allows Firebase Analytics (gtag) domains", async ({ page }) => {
    // Firebase Analytics loads gtag.js from googletagmanager.com and beacons
    // to *.google-analytics.com. A CSP tightening that drops these silently
    // breaks all analytics delivery (regression guard — see index.html CSP).
    await page.goto("");
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    expect(csp).toContain("https://www.googletagmanager.com");
    expect(csp).toContain("https://www.google-analytics.com");
  });

  test("no inline scripts in body (CSP compliance)", async ({ page }) => {
    await page.goto("");
    // Body should not contain inline script tags (head has the dark mode IIFE which is allowed by unsafe-inline)
    const bodyScripts = await page
      .locator('body script:not([src]):not([type="module"])')
      .count();
    expect(bodyScripts).toBe(0);
  });

  test("external resources use HTTPS", async ({ page }) => {
    await page.goto("");
    // Vite may turn relative module-preload URLs into absolute localhost URLs.
    // Inspect resolved URLs so protocol-relative and differently cased HTTP
    // resources cannot bypass the check. Only same-origin loopback HTTP is OK.
    const resources = await page.locator("link[href], script[src]").evaluateAll(
      (elements) => elements.map((element) => ({
        tag: element.tagName.toLowerCase(),
        url: element instanceof HTMLLinkElement
          ? element.href
          : (element as HTMLScriptElement).src,
      })),
    );
    const insecureResources = resources.filter(({ url }) =>
      isInsecureHttpResource(url, page.url()),
    );
    expect(insecureResources, "Insecure resource URLs (tag and URL)").toEqual([]);
  });

  test("noscript fallback exists", async ({ page }) => {
    await page.goto("");
    const noscript = await page.locator("noscript").count();
    expect(noscript).toBeGreaterThan(0);
  });
});


const local = "http://localhost:4173/Maiin/";
const production = "https://troposfit.com/";

const cases: [string, string, string, boolean][] = [
  ["absolute local preload", local, "http://localhost:4173/assets/preload.js", false],
  ["relative local preload", local, "./assets/preload.js", false],
  ["protocol-relative local preload", local, "//localhost:4173/assets/preload.js", false],
  ["external HTTPS", local, "https://cdn.example.com/script.js", false],
  ["external HTTP", local, "http://cdn.example.com/script.js", true],
  ["protocol-relative external HTTP", local, "//cdn.example.com/script.js", true],
  ["uppercase HTTP", local, "HTTP://cdn.example.com/script.js", true],
  ["different local port", local, "http://localhost:4174/script.js", true],
  ["different loopback host", local, "http://127.0.0.1:4173/script.js", true],
  ["IPv4 loopback", "http://127.0.0.1:4173/", "/assets/script.js", false],
  ["IPv6 loopback", "http://[::1]:4173/", "/assets/script.js", false],
  ["production relative HTTPS", production, "/assets/script.js", false],
  ["production same-host HTTP downgrade", production, "http://troposfit.com/script.js", true],
  ["production localhost HTTP", production, "http://localhost:4173/script.js", true],
  ["HTTPS localhost downgrade", "https://localhost:4173/", "http://localhost:4173/script.js", true],
  ["nonlocal HTTP page", "http://troposfit.com/", "/assets/script.js", true],
  ["localhost lookalike", "http://localhost.example.com/", "/assets/script.js", true],
];

test.describe("HTTPS resource policy", () => {
  for (const [name, documentUrl, resourceUrl, insecure] of cases) {
    test(name, () => {
      expect(isInsecureHttpResource(resourceUrl, documentUrl)).toBe(insecure);
    });
  }
});
