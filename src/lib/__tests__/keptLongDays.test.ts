// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { isLongDayKept, keepLongDay } from "../keptLongDays";

describe("keptLongDays", () => {
  beforeEach(() => localStorage.clear());

  it("remembers a kept day for the account that kept it", () => {
    keepLongDay("u1", "45|Pull A|a,b");
    expect(isLongDayKept("u1", "45|Pull A|a,b")).toBe(true);
    expect(isLongDayKept("u2", "45|Pull A|a,b")).toBe(false);
    expect(isLongDayKept("u1", "45|Pull A|a,b,c")).toBe(false);
  });

  it("keeps nothing with no account", () => {
    keepLongDay(undefined, "k");
    expect(isLongDayKept(undefined, "k")).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it("drops the oldest past forty", () => {
    for (let i = 0; i < 41; i++) keepLongDay("u1", `k${String(i)}`);
    expect(isLongDayKept("u1", "k0")).toBe(false);
    expect(isLongDayKept("u1", "k1")).toBe(true);
    expect(isLongDayKept("u1", "k40")).toBe(true);
  });

  it("reads a damaged entry as none kept", () => {
    keepLongDay("u1", "k");
    const key = Object.keys(localStorage)[0];
    localStorage.setItem(key, "{not json");
    expect(isLongDayKept("u1", "k")).toBe(false);
    localStorage.setItem(key, JSON.stringify({ k: true }));
    expect(isLongDayKept("u1", "k")).toBe(false);
  });
});
