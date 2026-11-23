/**
 * Agreement before Tropos stores health details: the app, the server and
 * the rules read one answer.
 *
 * src/lib/healthConsent.ts decides whether the app opens on the agreement
 * (setup's step, the gate before the app) and what setup sends;
 * functions/lib/healthConsent.js decides whether `completeOnboarding`
 * finishes setup; firestore.rules decide what the gate's write may store.
 * If the two copies read a stored answer differently, one of two things
 * happens and neither looks like a bug: an account that agreed is asked
 * again on every open, or one that did not is let into the app. If setup's
 * payload is not the one the server accepts, nobody can finish setup.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import {
  HEALTH_CONSENT_REQUIRED_REASON,
  HEALTH_DATA_CONSENT_VERSION,
  hasCurrentHealthConsent,
  setupHealthConsent,
} from "@/lib/healthConsent";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/healthConsent.js");

const stamped = { toDate: () => new Date("2026-11-21T10:00:00Z") };

describe("health-data agreement: the app and the server agree", () => {
  it("ask for the same wording", () => {
    expect(server.HEALTH_DATA_CONSENT_VERSION).toBe(
      HEALTH_DATA_CONSENT_VERSION
    );
  });

  it("read every stored answer the same way", () => {
    const stored: unknown[] = [
      undefined,
      null,
      {},
      true,
      "1",
      { version: 1, at: stamped },
      // A write made offline: the device holds the server's time as null.
      { version: 1, at: null },
      { version: 2, at: stamped },
      { version: 0, at: stamped },
      { version: "1", at: stamped },
      { version: 1.5, at: stamped },
      { at: stamped },
    ];
    const verdicts = stored.map((value) => ({
      value,
      app: hasCurrentHealthConsent(value),
      server: server.hasCurrentHealthConsent(value),
    }));
    // Anchors: some are agreements and some are not, so the comparison is
    // not vacuous either way.
    expect(verdicts.filter((v) => v.server)).toHaveLength(3);
    expect(verdicts.filter((v) => !v.server)).toHaveLength(9);
    for (const v of verdicts) expect(v.app).toBe(v.server);
  });

  it("accept what setup sends, and only for the current wording", () => {
    expect(server.setupConsentAccepted(setupHealthConsent())).toBe(true);
    for (const refused of [
      undefined,
      null,
      {},
      [],
      true,
      { version: HEALTH_DATA_CONSENT_VERSION - 1 },
      { version: HEALTH_DATA_CONSENT_VERSION + 1 },
      { version: String(HEALTH_DATA_CONSENT_VERSION) },
    ])
      expect(server.setupConsentAccepted(refused)).toBe(false);
  });

  it("store what the app then reads as agreed", () => {
    expect(hasCurrentHealthConsent(server.healthConsentRecord(stamped))).toBe(
      true
    );
  });

  it("use the same refusal reason", () => {
    expect(server.HEALTH_CONSENT_REQUIRED).toBe(HEALTH_CONSENT_REQUIRED_REASON);
  });

  it("let the gate's write store the current version, and only it", () => {
    const rules = readFileSync("firestore.rules", "utf8");
    const gate = rules.match(
      /function healthDataConsentValid\(\) \{([\s\S]*?)\n {4}\}/
    );
    expect(gate, "firestore.rules defines healthDataConsentValid()").not.toBe(
      null
    );
    expect(gate![1]).toContain(
      `consent.version == ${HEALTH_DATA_CONSENT_VERSION}`
    );
    expect(gate![1]).toContain("consent.at == request.time");
  });
});
