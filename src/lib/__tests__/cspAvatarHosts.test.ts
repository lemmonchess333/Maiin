/**
 * Every host firestore.rules lets a photo URL name must be one the CSP
 * lets an <img> load from.
 *
 * `isAllowedPhotoUrl` accepts Google's and Apple's sign-in avatar hosts,
 * and a Google or Apple sign-in seeds the profile photo from the provider
 * (auth.tsx, createDefaultProfile). The CSP's img-src left both out, so
 * the browser refused every such avatar and `Avatar` quietly drew the
 * person's initial instead, in the feed, on profiles and in comments, on
 * the web and inside the app's WebView alike. Read from both files, so a
 * host added to the rule and not to the CSP fails here.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), "utf8");

function ruleHosts(): string[] {
  const rules = read("../../../firestore.rules");
  const body = rules.match(
    /function isAllowedPhotoUrl\(v\) \{([\s\S]*?)\n\s*\}/
  );
  expect(
    body,
    "isAllowedPhotoUrl is defined in firestore.rules"
  ).not.toBeNull();
  const hosts = [...body![1].matchAll(/matches\('\^https:\/\/([^/']+)\//g)].map(
    (m) => m[1].replace(/\\\\\./g, ".")
  );
  expect(hosts.length).toBeGreaterThan(0);
  return hosts;
}

/** The policy itself, not the comment above it, which names directives too. */
function imgSources(): string[] {
  const html = read("../../../index.html");
  const policy = html.match(
    /http-equiv="Content-Security-Policy"\s+content="([\s\S]*?)"/
  );
  expect(policy, "index.html has a CSP meta tag").not.toBeNull();
  const imgSrc = policy![1]
    .split(";")
    .map((part) => part.trim().split(/\s+/))
    .find(([name]) => name === "img-src");
  expect(imgSrc, "the CSP has an img-src").toBeDefined();
  return imgSrc!.slice(1);
}

/** Whether a CSP host source (`https://x.y`, `https://*.y`) admits `host`. */
function admits(source: string, host: string): boolean {
  const m = /^https:\/\/(\*\.)?([^/]+)$/.exec(source);
  if (!m) return false;
  return m[1] ? host.endsWith(`.${m[2]}`) : host === m[2];
}

describe("CSP: the photo hosts the rules allow can be drawn", () => {
  it("reads the three hosts the rule names", () => {
    expect(ruleHosts().sort()).toEqual([
      "appleid.cdn-apple.com",
      "firebasestorage.googleapis.com",
      "lh3.googleusercontent.com",
    ]);
  });

  it.each(ruleHosts())("img-src admits %s", (host) => {
    expect(imgSources().some((source) => admits(source, host))).toBe(true);
  });
});
