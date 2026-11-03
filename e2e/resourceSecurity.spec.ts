import { test, expect } from "@playwright/test";
import { isInsecureHttpResource } from "./helpers/resourceSecurity";

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
