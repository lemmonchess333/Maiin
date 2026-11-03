/**
 * Soc15 — the accounts in DISCOVERY_HIDDEN_UIDS (App Review's demo account)
 * share with their followers only, so they stay out of everyone's Explore
 * and suggestions (lib/discoveryHidden.js).
 */
import { describe, it, expect, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  HIDE_UPDATE,
  SWEEP_PAGE,
  discoveryHiddenUids,
  isDiscoveryHidden,
  hidePublicPosts,
  sweepDiscoveryHidden,
} = require("../lib/discoveryHidden");

const ORIGINAL = process.env.DISCOVERY_HIDDEN_UIDS;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DISCOVERY_HIDDEN_UIDS;
  else process.env.DISCOVERY_HIDDEN_UIDS = ORIGINAL;
});

/** Activities by author and visibility; `activities` answers the sweep's
 *  query from them and a batch records its updates. */
function makeFirestore(posts) {
  const queries = [];
  const updates = [];
  const firestore = {
    collection(name) {
      const filters = [];
      let limit = null;
      const builder = {
        where(field, op, value) {
          filters.push([field, op, value]);
          return builder;
        },
        limit(n) {
          limit = n;
          return builder;
        },
        async get() {
          queries.push({ name, filters: [...filters], limit });
          const matches = posts.filter((p) =>
            filters.every(([field, , value]) => p[field] === value)
          );
          return {
            empty: matches.length === 0,
            docs: matches.map((p) => ({ ref: { id: p.id } })),
          };
        },
      };
      return builder;
    },
    batch() {
      const pending = [];
      return {
        update(ref, data) {
          pending.push({ id: ref.id, data });
        },
        async commit() {
          updates.push(...pending);
        },
      };
    },
  };
  return { firestore, queries, updates };
}

describe("discoveryHiddenUids", () => {
  it("reads a comma list, ignoring spaces and empty entries", () => {
    process.env.DISCOVERY_HIDDEN_UIDS = " review1 , ,review2,";
    expect([...discoveryHiddenUids()]).toEqual(["review1", "review2"]);
    expect(isDiscoveryHidden("review2")).toBe(true);
    expect(isDiscoveryHidden("someone")).toBe(false);
  });

  it("hides no one when unset or empty", () => {
    delete process.env.DISCOVERY_HIDDEN_UIDS;
    expect(discoveryHiddenUids().size).toBe(0);
    expect(isDiscoveryHidden("review1")).toBe(false);
    process.env.DISCOVERY_HIDDEN_UIDS = "";
    expect(isDiscoveryHidden("")).toBe(false);
    expect(isDiscoveryHidden(undefined)).toBe(false);
  });

  it("is read on every call, not once at load", () => {
    process.env.DISCOVERY_HIDDEN_UIDS = "a";
    expect(isDiscoveryHidden("b")).toBe(false);
    process.env.DISCOVERY_HIDDEN_UIDS = "a,b";
    expect(isDiscoveryHidden("b")).toBe(true);
  });
});

describe("hidePublicPosts", () => {
  it("makes the account's public posts followers-only and marks why", async () => {
    const { firestore, queries, updates } = makeFirestore([
      { id: "p1", authorId: "review1", visibility: "public" },
      { id: "p2", authorId: "review1", visibility: "followers" },
      { id: "p3", authorId: "other", visibility: "public" },
    ]);
    const result = await hidePublicPosts({ firestore, uid: "review1" });
    expect(result).toEqual({ hidden: 1 });
    expect(queries[0]).toEqual({
      name: "activities",
      filters: [
        ["authorId", "==", "review1"],
        ["visibility", "==", "public"],
      ],
      limit: SWEEP_PAGE,
    });
    expect(updates).toEqual([
      { id: "p1", data: { visibility: "followers", discoveryHidden: true } },
    ]);
    expect(HIDE_UPDATE).toEqual({
      visibility: "followers",
      discoveryHidden: true,
    });
  });

  it("writes nothing when the account has no public post", async () => {
    const { firestore, updates } = makeFirestore([
      { id: "p2", authorId: "review1", visibility: "followers" },
    ]);
    expect(await hidePublicPosts({ firestore, uid: "review1" })).toEqual({
      hidden: 0,
    });
    expect(updates).toEqual([]);
  });
});

describe("sweepDiscoveryHidden", () => {
  it("sweeps every listed account and only them", async () => {
    process.env.DISCOVERY_HIDDEN_UIDS = "review1,review2";
    const { firestore, updates } = makeFirestore([
      { id: "a", authorId: "review1", visibility: "public" },
      { id: "b", authorId: "review2", visibility: "public" },
      { id: "c", authorId: "other", visibility: "public" },
    ]);
    expect(await sweepDiscoveryHidden({ firestore })).toEqual({ hidden: 2 });
    expect(updates.map((u) => u.id).sort()).toEqual(["a", "b"]);
  });

  it("reads nothing with the list empty", async () => {
    delete process.env.DISCOVERY_HIDDEN_UIDS;
    const { firestore, queries } = makeFirestore([
      { id: "c", authorId: "other", visibility: "public" },
    ]);
    expect(await sweepDiscoveryHidden({ firestore })).toEqual({ hidden: 0 });
    expect(queries).toEqual([]);
  });
});
