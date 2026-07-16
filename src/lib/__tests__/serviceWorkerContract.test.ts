import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Static contract for both public service workers (packet 17). A notification
 * tap must never be dropped while Firebase Messaging loads, so the
 * `notificationclick` listener MUST be installed before the first
 * `firebase-messaging-compat.js` import in each worker. The canonical worker
 * must carry the FCM background handler; the legacy worker must remain hosted
 * during the migration window.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const swPath = resolve(repoRoot, "public/sw.js");
const legacyPath = resolve(repoRoot, "public/firebase-messaging-sw.js");

function assertClickBeforeMessagingImport(source: string, label: string) {
  const clickIdx = source.indexOf("notificationclick");
  const importIdx = source.indexOf("firebase-messaging-compat.js");
  expect(
    clickIdx,
    `${label}: notificationclick listener missing`
  ).toBeGreaterThanOrEqual(0);
  expect(
    importIdx,
    `${label}: firebase-messaging import missing`
  ).toBeGreaterThanOrEqual(0);
  expect(
    clickIdx,
    `${label}: notificationclick must precede the messaging import`
  ).toBeLessThan(importIdx);
}

describe("service-worker file contract", () => {
  it("public/sw.js installs notificationclick before importing FCM messaging", () => {
    assertClickBeforeMessagingImport(readFileSync(swPath, "utf8"), "sw.js");
  });

  it("public/sw.js carries the FCM background handler", () => {
    expect(readFileSync(swPath, "utf8")).toContain("onBackgroundMessage");
  });

  it("public/firebase-messaging-sw.js is retained and correctly ordered", () => {
    expect(existsSync(legacyPath)).toBe(true);
    assertClickBeforeMessagingImport(
      readFileSync(legacyPath, "utf8"),
      "firebase-messaging-sw.js"
    );
  });
});
