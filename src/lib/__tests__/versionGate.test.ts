import { describe, it, expect } from "vitest";
import {
  parseVersion,
  isVersionBelow,
  upgradeRequired,
} from "../versionGate";

describe("parseVersion", () => {
  it("parses full, partial, and v-prefixed versions", () => {
    expect(parseVersion("1.2.3")).toEqual([1, 2, 3]);
    expect(parseVersion("1.2")).toEqual([1, 2, 0]);
    expect(parseVersion("2")).toEqual([2, 0, 0]);
    expect(parseVersion("v1.4.0")).toEqual([1, 4, 0]);
    expect(parseVersion(" 1.0.0 ")).toEqual([1, 0, 0]);
  });

  it("rejects garbage", () => {
    expect(parseVersion("")).toBeNull();
    expect(parseVersion("abc")).toBeNull();
    expect(parseVersion("1.2.3-beta")).toBeNull();
    expect(parseVersion("1..3")).toBeNull();
  });
});

describe("isVersionBelow", () => {
  it("orders semver correctly", () => {
    expect(isVersionBelow("1.2.0", "1.3.0")).toBe(true);
    expect(isVersionBelow("1.3.0", "1.3.0")).toBe(false);
    expect(isVersionBelow("1.3.1", "1.3.0")).toBe(false);
    expect(isVersionBelow("1.9.9", "2.0.0")).toBe(true);
    expect(isVersionBelow("1.10.0", "1.9.0")).toBe(false); // numeric, not lexicographic
    expect(isVersionBelow("1.2", "1.2.1")).toBe(true);
  });

  it("fails open on unparseable input", () => {
    expect(isVersionBelow("garbage", "1.0.0")).toBe(false);
    expect(isVersionBelow("1.0.0", "garbage")).toBe(false);
  });
});

describe("upgradeRequired", () => {
  it("engages only on an explicit, well-formed operator value", () => {
    expect(upgradeRequired("1.2.0", { minSupportedVersion: "1.3.0" })).toBe(
      true
    );
    expect(upgradeRequired("1.3.0", { minSupportedVersion: "1.3.0" })).toBe(
      false
    );
  });

  it("fails open on missing doc / missing field / malformed types", () => {
    expect(upgradeRequired("1.0.0", undefined)).toBe(false);
    expect(upgradeRequired("1.0.0", {})).toBe(false);
    expect(upgradeRequired("1.0.0", { minSupportedVersion: 2 })).toBe(false);
    expect(upgradeRequired("1.0.0", { minSupportedVersion: "" })).toBe(false);
    expect(upgradeRequired("1.0.0", { minSupportedVersion: "junk" })).toBe(
      false
    );
  });
});
