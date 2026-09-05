/**
 * Hosting security headers + CSP form-action (security workstream, item 1e).
 *
 * Firebase Hosting is the only surface that can set response headers on the
 * web build (GitHub Pages cannot), so the transport, sniffing and
 * anti-framing protections live in firebase.json and ship only via
 * deploy-hosting.yml. `frame-ancestors` is IGNORED in a <meta> CSP, which is
 * why it is a header here and deliberately absent from index.html. This
 * guard pins the "**" headers entry so a later edit cannot silently drop
 * one, and pins `form-action 'self'` in the <meta> CSP, where the content
 * policy lives.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

interface HostingHeader {
  key: string;
  value: string;
}
interface HostingHeaderRule {
  source: string;
  headers: HostingHeader[];
}
interface FirebaseJson {
  hosting: { headers: HostingHeaderRule[] };
}

const firebaseJson = JSON.parse(
  readFileSync(resolve(repoRoot, "firebase.json"), "utf8")
) as FirebaseJson;
const indexHtml = readFileSync(resolve(repoRoot, "index.html"), "utf8");

function headersFor(source: string): Map<string, string> {
  const rule = firebaseJson.hosting.headers.find((h) => h.source === source);
  expect(
    rule,
    `firebase.json hosting.headers has no "${source}" entry`
  ).toBeDefined();
  return new Map(
    (rule as HostingHeaderRule).headers.map((h) => [
      h.key.toLowerCase(),
      h.value,
    ])
  );
}

describe("Firebase Hosting security headers (firebase.json, source **)", () => {
  const all = headersFor("**");

  it("Strict-Transport-Security covers a year and includes subdomains", () => {
    const v = all.get("strict-transport-security") ?? "";
    const maxAge = Number((v.match(/max-age=(\d+)/) || [])[1] ?? 0);
    expect(maxAge).toBeGreaterThanOrEqual(31_536_000);
    expect(v).toMatch(/includeSubDomains/i);
  });

  it("X-Content-Type-Options is nosniff", () => {
    expect(all.get("x-content-type-options")).toBe("nosniff");
  });

  it("Referrer-Policy is strict-origin-when-cross-origin", () => {
    expect(all.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("X-Frame-Options is DENY", () => {
    expect(all.get("x-frame-options")).toBe("DENY");
  });

  it("the CSP header carries frame-ancestors 'none' (header-only directive)", () => {
    expect(all.get("content-security-policy") ?? "").toMatch(
      /frame-ancestors 'none'/
    );
  });

  it("Permissions-Policy grants camera and geolocation to self only, denies the microphone", () => {
    const v = all.get("permissions-policy") ?? "";
    expect(v).toMatch(/camera=\(self\)/);
    expect(v).toMatch(/geolocation=\(self\)/);
    expect(v).toMatch(/microphone=\(\)/);
  });

  it("the /assets/** immutable cache header is still declared", () => {
    expect(headersFor("/assets/**").get("cache-control")).toMatch(/immutable/);
  });
});

describe("index.html <meta> Content-Security-Policy", () => {
  const meta = indexHtml.match(
    /http-equiv="Content-Security-Policy"\s+content="([\s\S]*?)"/
  );

  it("declares form-action 'self'", () => {
    expect(meta?.[1] ?? "").toMatch(/form-action 'self'/);
  });

  it("does not carry frame-ancestors (ignored in a meta policy; it is a Hosting header)", () => {
    expect(meta?.[1] ?? "").not.toMatch(/frame-ancestors/);
  });
});
