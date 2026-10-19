/**
 * index.html warms only hosts the app talks to.
 *
 * It preconnected to https://firebaseio.com, the Realtime Database's
 * domain (and its apex, which no project uses). The app reads Firestore,
 * not the Realtime Database, so every cold start opened a TLS connection
 * to a host nothing ever asked.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const html = readFileSync(resolve(repoRoot, "index.html"), "utf8").replace(
  /<!--[\s\S]*?-->/g,
  ""
);

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "__tests__" && name !== "test") sources(full, out);
    } else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe("index.html's warm-up links", () => {
  it("does not warm the Realtime Database, which the app does not use", () => {
    const usesRealtimeDatabase = sources(resolve(repoRoot, "src")).some(
      (file) =>
        /from ["']firebase\/database["']/.test(readFileSync(file, "utf8"))
    );
    expect(usesRealtimeDatabase).toBe(false);
    expect(html).not.toMatch(
      /rel="(preconnect|dns-prefetch)"[^>]*firebaseio\.com/
    );
  });

  it("still warms Firestore's host (the anchor: the scan reads the links)", () => {
    expect(html).toMatch(
      /rel="dns-prefetch"[^>]*href="https:\/\/firestore\.googleapis\.com"/
    );
  });
});
