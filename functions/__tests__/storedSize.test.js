/**
 * The size the post triggers weigh a new post by (lib/storedSize.js):
 * Firestore's own size rules, and no way for a client's data to be
 * measured as smaller than it is.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { storedSize } = require("../lib/storedSize");

describe("storedSize", () => {
  it("sizes each value as Firestore does", () => {
    expect(storedSize("abc")).toBe(4);
    expect(storedSize("é")).toBe(3);
    expect(storedSize(42)).toBe(8);
    expect(storedSize(true)).toBe(1);
    expect(storedSize(null)).toBe(1);
    expect(storedSize(["a", 1])).toBe(2 + 8);
    expect(storedSize({ ab: "c" })).toBe(3 + 2);
    expect(storedSize(Buffer.from("abcd"))).toBe(4);
  });

  it("walks maps inside lists, where the rules cannot look", () => {
    const row = { name: "x".repeat(9000) };
    expect(storedSize({ exercises: Array(100).fill(row) })).toBeGreaterThan(
      900_000
    );
  });

  it("sizes a timestamp, a reference and a geopoint by what they store", () => {
    class Timestamp {
      toMillis() {
        return 0;
      }
    }
    class DocumentReference {
      constructor() {
        this.path = "users/u1";
        // The client a reference carries is never walked.
        this._firestore = { huge: "x".repeat(100_000) };
      }
    }
    class GeoPoint {
      constructor() {
        this.latitude = 51.5;
        this.longitude = -0.1;
      }
    }
    expect(storedSize(new Timestamp())).toBe(8);
    expect(storedSize(new DocumentReference())).toBe(9);
    expect(storedSize(new GeoPoint())).toBe(16);
  });

  it("weighs a map that imitates a special type as the map it is", () => {
    const big = "x".repeat(100_000);
    for (const imitation of [
      { path: "a", firestore: 1, big },
      { toMillis: "no", big },
      { latitude: 1, longitude: 2, big },
    ]) {
      expect(storedSize(imitation)).toBeGreaterThan(100_000);
    }
  });

  it("stops on a value that loops", () => {
    const loop = {};
    loop.self = loop;
    expect(Number.isFinite(storedSize(loop))).toBe(true);
  });
});
