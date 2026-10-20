/**
 * clampDisplayName: the cut a Google or Apple account's own name gets at
 * sign-up, so the public profile's 50-character gate accepts it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { clampDisplayName, DISPLAY_NAME_MAX } from "@/lib/displayNameLimit";
import { DISPLAY_NAME_MAX as VALIDATED_MAX } from "@/lib/displayName";

describe("clampDisplayName", () => {
  it("leaves a name within the limit as it is, trimmed", () => {
    expect(clampDisplayName("  Sam Lee  ")).toBe("Sam Lee");
    expect(clampDisplayName("a".repeat(DISPLAY_NAME_MAX))).toBe(
      "a".repeat(DISPLAY_NAME_MAX)
    );
    expect(clampDisplayName("")).toBe("");
  });

  it("cuts a longer name to the limit", () => {
    expect(clampDisplayName("a".repeat(60))).toBe("a".repeat(DISPLAY_NAME_MAX));
    // A real name of 60: the 50th character is a space, so 49 are kept.
    expect(
      clampDisplayName(
        "María Fernanda de los Ángeles Rodríguez-Gutiérrez de la Vega"
      )
    ).toBe("María Fernanda de los Ángeles Rodríguez-Gutiérrez");
  });

  it("never ends on half an emoji or on a space", () => {
    // The 50th code unit is the first half of 🏃.
    expect(clampDisplayName("a".repeat(49) + "🏃b")).toBe("a".repeat(49));
    expect(clampDisplayName("a".repeat(49) + " bcd")).toBe("a".repeat(49));
  });

  it("is the limit setup and Settings validate against", () => {
    expect(DISPLAY_NAME_MAX).toBe(VALIDATED_MAX);
  });
});

describe("reachability: sign-up cuts the provider's name", () => {
  const auth = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../auth.tsx"),
    "utf8"
  );

  it("createDefaultProfile stores the cut name", () => {
    const start = auth.indexOf("function createDefaultProfile(");
    expect(start).toBeGreaterThan(-1);
    const body = auth.slice(start, auth.indexOf("\n}\n", start));
    expect(body).toContain("displayName: clampDisplayName(displayName)");
  });

  it("the auth provider does not load the word filter to do it", () => {
    // auth.tsx is in the first chunk; displayName.ts brings the filter's
    // dictionary with it.
    expect(auth).not.toMatch(/from "@\/lib\/(displayName|profanityFilter)"/);
  });
});
