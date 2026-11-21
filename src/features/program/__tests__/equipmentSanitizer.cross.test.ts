/**
 * Every equipment setup the app offers survives the server's profile
 * sanitizer, which `completeOnboarding` and `configurePlan` run every
 * profile write through (`functions/profileSanitizer.js`).
 *
 * The sanitizer keeps any short string for `equipment`, so the no-equipment
 * setup needed no server change. This holds that from the server's side: a
 * sanitizer tightened to a list of setups that leaves one out would drop
 * the field from the write, and the person's plan would be rebuilt on the
 * next save for a full gym.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VALID_EQUIPMENT } from "../programTypes";

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);
const require = createRequire(import.meta.url);
const { sanitizeProfileData } = require(
  resolve(repoRoot, "functions/profileSanitizer.js")
) as {
  sanitizeProfileData: (
    raw: Record<string, unknown>
  ) => Record<string, unknown>;
};

describe("the server keeps every equipment setup", () => {
  it.each([...VALID_EQUIPMENT])("%s", (equipment) => {
    expect(sanitizeProfileData({ equipment }).equipment).toBe(equipment);
  });
});
