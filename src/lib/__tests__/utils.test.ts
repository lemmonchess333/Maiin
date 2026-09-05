import { describe, it, expect } from "vitest";
import { cn, clamp } from "../utils";

describe("cn (class name merger)", () => {
  it("merges simple class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    const isHidden = false;
    expect(cn("base", isHidden && "hidden", "visible")).toBe("base visible");
  });

  it("merges conflicting Tailwind classes (last wins)", () => {
    expect(cn("px-4", "px-6")).toBe("px-6");
  });

  it("handles undefined and null inputs", () => {
    expect(cn("base", undefined, null, "end")).toBe("base end");
  });

  it("handles empty string", () => {
    expect(cn("")).toBe("");
  });

  it("handles array inputs", () => {
    expect(cn(["foo", "bar"])).toBe("foo bar");
  });

  it("deduplicates Tailwind utility conflicts", () => {
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("preserves non-conflicting classes", () => {
    // eslint-disable-next-line no-restricted-syntax -- test FIXTURE strings for cn(), not rendered UI classes.
    expect(cn("rounded-lg", "p-4", "bg-white")).toBe("rounded-lg p-4 bg-white");
  });
});

describe("clamp (the one definition — three modules used to carry their own)", () => {
  it("returns the value inside the range and the bound outside it", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});
