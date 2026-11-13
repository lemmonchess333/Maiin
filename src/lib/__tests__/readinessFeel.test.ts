// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { READINESS_FEEL_KEY, readFeel, writeFeel } from "../readinessFeel";

beforeEach(() => {
  localStorage.clear();
});

describe("readinessFeel", () => {
  it("keeps today's answer for this account", () => {
    writeFeel("uid-1", "2026-11-13", "tired");
    expect(readFeel("uid-1", "2026-11-13")).toBe("tired");
  });

  it("asks afresh the next day, and for another account", () => {
    writeFeel("uid-1", "2026-11-13", "rough");
    expect(readFeel("uid-1", "2026-11-14")).toBeNull();
    expect(readFeel("uid-2", "2026-11-13")).toBeNull();
  });

  it("clearing it asks again", () => {
    writeFeel("uid-1", "2026-11-13", "good");
    writeFeel("uid-1", "2026-11-13", null);
    expect(readFeel("uid-1", "2026-11-13")).toBeNull();
    expect(localStorage.getItem(`${READINESS_FEEL_KEY}:uid-1`)).toBeNull();
  });

  it("ignores anything stored that is not an answer", () => {
    localStorage.setItem(
      `${READINESS_FEEL_KEY}:uid-1`,
      JSON.stringify({ dayKey: "2026-11-13", feel: "great" })
    );
    expect(readFeel("uid-1", "2026-11-13")).toBeNull();
    localStorage.setItem(`${READINESS_FEEL_KEY}:uid-1`, "not json");
    expect(readFeel("uid-1", "2026-11-13")).toBeNull();
  });
});
