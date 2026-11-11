/**
 * The Monday review's local notification stands aside for any account the
 * server's Monday recap push may reach. The app reads that from the push
 * settings document (`serverRecapPushOn`); the server decides with
 * `mayTargetUserConsent(consent, "recap")`. One answer for every stored
 * shape, including the first-week opt-in's `recap: false` and documents
 * written before a flag existed.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { serverRecapPushOn } from "@/lib/reviewReminder";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/pushConsent.js") as {
  mayTargetUserConsent: (consent: unknown, type: string) => boolean;
};

const SHAPES: [string, unknown][] = [
  ["no document", undefined],
  ["null", null],
  ["push off", { enabled: false, recap: true }],
  ["push on, recap on", { enabled: true, recap: true }],
  ["push on, recap absent", { enabled: true }],
  ["push on, recap off (first-week opt-in)", { enabled: true, recap: false }],
  ["push on, recap malformed", { enabled: true, recap: null }],
  ["push malformed", { enabled: "yes", recap: true }],
  ["recap on, push absent", { recap: true }],
];

describe("who the server's Monday recap push reaches", () => {
  it.each(SHAPES)("agrees with the server for %s", (_name, consent) => {
    expect(serverRecapPushOn(consent)).toBe(
      server.mayTargetUserConsent(consent, "recap")
    );
  });
});
