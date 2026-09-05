// @vitest-environment jsdom — the module under test IS the storage global's
// wrapper; the rest of this directory runs in the node environment.
/**
 * The one door to local storage never throws, and says what happened.
 *
 * Storage fails three ways, each pinned here: ABSENT (SSR / Node — the
 * global is undefined), UNREACHABLE (a browser with site data blocked throws
 * from the `localStorage` getter itself, before any method is reached), and
 * PER-CALL (quota or private mode throw from setItem / getItem / removeItem).
 * Reads must answer with the fallback and writes must report false — the
 * run-resume store commits its meta only after every chunk write returned
 * true, so a write that swallowed a failure and reported success would
 * advance the counts past chunks that never landed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isAvailable,
  keysWithPrefix,
  readJson,
  readString,
  remove,
  scopedKey,
  writeJson,
  writeString,
} from "@/lib/localStore";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("round trips", () => {
  it("writes, reads and removes a string", () => {
    expect(readString("k")).toBeNull();
    expect(writeString("k", "v")).toBe(true);
    expect(readString("k")).toBe("v");
    expect(remove("k")).toBe(true);
    expect(readString("k")).toBeNull();
  });

  it("removing an absent key reports true — the key is gone either way", () => {
    expect(remove("never-written")).toBe(true);
  });

  it("JSON round-trips, and the fallback covers absent AND malformed", () => {
    expect(readJson("j", { d: 1 })).toEqual({ d: 1 });
    expect(writeJson("j", { a: [1, 2] })).toBe(true);
    expect(readJson<unknown>("j", null)).toEqual({ a: [1, 2] });
    localStorage.setItem("j", "{not json");
    expect(readJson("j", "fallback")).toBe("fallback");
  });

  it("writeJson reports false for a value JSON cannot serialise", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(writeJson("c", cyclic)).toBe(false);
    expect(readString("c")).toBeNull();
  });

  it("keysWithPrefix lists exactly the matching keys", () => {
    localStorage.setItem("a:1", "x");
    localStorage.setItem("a:2", "y");
    localStorage.setItem("b:1", "z");
    expect(keysWithPrefix("a:").sort()).toEqual(["a:1", "a:2"]);
    expect(keysWithPrefix("zzz")).toEqual([]);
  });

  it("reports storage available in a browser", () => {
    expect(isAvailable()).toBe(true);
  });
});

describe("scopedKey", () => {
  it("is `<base>:<uid>` — the layout stored markers already sit under", () => {
    /* The ease-week markers and the pace-insight dismissal were written
       under this shape before the helper existed; a different delimiter
       would orphan every stored value. */
    expect(scopedKey("tropos:easeNudge:lastShown", "u1")).toBe(
      "tropos:easeNudge:lastShown:u1"
    );
    expect(scopedKey("tropos.dismiss.paceInsight", "u1")).toBe(
      "tropos.dismiss.paceInsight:u1"
    );
    expect(scopedKey("k", "u1")).not.toBe(scopedKey("k", "u2"));
  });
});

describe("per-call throws (quota, private mode)", () => {
  it("writeString and writeJson report false without throwing", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(writeString("k", "v")).toBe(false);
    expect(writeJson("k", 1)).toBe(false);
  });

  it("readString answers null and readJson the fallback", () => {
    localStorage.setItem("k", "v");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(readString("k")).toBeNull();
    expect(readJson("k", "fb")).toBe("fb");
  });

  it("remove reports false", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(remove("k")).toBe(false);
  });

  it("keysWithPrefix returns what it managed to list", () => {
    localStorage.setItem("a:1", "x");
    vi.spyOn(Storage.prototype, "key").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(keysWithPrefix("a:")).toEqual([]);
  });
});

describe("storage absent (SSR / Node)", () => {
  it("every read takes the fallback and every write reports false", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(isAvailable()).toBe(false);
    expect(readString("k")).toBeNull();
    expect(readJson("k", 7)).toBe(7);
    expect(writeString("k", "v")).toBe(false);
    expect(writeJson("k", "v")).toBe(false);
    expect(remove("k")).toBe(false);
    expect(keysWithPrefix("")).toEqual([]);
  });
});

describe("storage unreachable (the getter itself throws — site data blocked)", () => {
  it("is reported unavailable, and nothing throws", () => {
    const original = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage"
    );
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    try {
      expect(isAvailable()).toBe(false);
      expect(readString("k")).toBeNull();
      expect(readJson("k", "fb")).toBe("fb");
      expect(writeString("k", "v")).toBe(false);
      expect(remove("k")).toBe(false);
      expect(keysWithPrefix("")).toEqual([]);
    } finally {
      if (original) {
        Object.defineProperty(globalThis, "localStorage", original);
      } else {
        delete (globalThis as { localStorage?: unknown }).localStorage;
      }
    }
  });
});
