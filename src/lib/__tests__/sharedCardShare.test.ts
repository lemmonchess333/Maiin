/**
 * The share sheet's side of a card's page (Soc17 call 1): the token, the
 * copy that leaves the phone, and what each share leaves behind.
 */
import { describe, expect, it, vi } from "vitest";
import type { ShareCardRenderData } from "@/components/share/ShareCardRenderer";
import { sharedCardUrl } from "@/lib/publicLinks";
import {
  SHARED_CARD_TOKEN,
  cardLinkSession,
  newSharedCardToken,
  sharedCardCopy,
  type SharedCardCopy,
} from "@/lib/sharedCardShare";

const RUN: ShareCardRenderData = {
  unit: "km",
  liftUnit: "kg",
  template: "run",
  format: "story",
  background: "photo",
  handle: "Sam Rivers",
  date: "21 Nov 2026",
  hiddenStats: new Set(["pace"]),
  photoUrl: "data:image/jpeg;base64,AAAA",
  routePath: "M 10 10 L 900 900",
  headline: "Long run",
  distanceKm: 10.21,
  durationSec: 3130,
  paceSecPerKm: 306,
  elevationM: 84,
  splits: [{ lap: 1, paceSecPerKm: 310 }],
  artSrc: "/form-art/run-fast.webp",
};

describe("the token", () => {
  it("is 128 random bits in 22 URL-safe characters", () => {
    const token = newSharedCardToken();
    expect(token).toMatch(SHARED_CARD_TOKEN);
    expect(newSharedCardToken()).not.toBe(token);
    // Every byte's bits reach the token, the URL-unsafe ones swapped.
    expect(newSharedCardToken(() => new Uint8Array(16).fill(0xff))).toBe(
      "_____________________w"
    );
    expect(newSharedCardToken(() => new Uint8Array(16).fill(0xfb))).toMatch(
      /^[A-Za-z0-9_-]{22}$/
    );
  });
});

describe("the copy that leaves the phone", () => {
  it("carries the figures shown and never the route, the photo, the drawing or the name", () => {
    const copy = sharedCardCopy(RUN)!;
    expect(copy).toEqual({
      template: "run",
      format: "story",
      background: "brand",
      unit: "km",
      liftUnit: "kg",
      hiddenStats: ["pace"],
      date: "21 Nov 2026",
      headline: "Long run",
      distanceKm: 10.21,
      durationSec: 3130,
      elevationM: 84,
      splits: [{ lap: 1, paceSecPerKm: 310 }],
    });
    const out = JSON.stringify(copy);
    for (const leak of ["Sam", "M 10", "data:", "run-fast", "306"]) {
      expect(out).not.toContain(leak);
    }
  });

  it("gives an anniversary no page", () => {
    expect(sharedCardCopy({ ...RUN, template: "anniversary" })).toBeNull();
  });
});

const COPY = sharedCardCopy(RUN)!;
const OTHER = { ...COPY, format: "square" } as SharedCardCopy;
const SOURCES = { runId: "r1" };
const FALLBACK = "https://troposfit.com/?invite=K7P49M2H";

function harness(
  store: (token: string) => Promise<boolean> = async () => true
) {
  let n = 0;
  let clock = 0;
  const stores: string[] = [];
  const removed: string[] = [];
  const session = cardLinkSession({
    store: (token) => {
      stores.push(token);
      return store(token);
    },
    remove: async (token) => {
      removed.push(token);
    },
    makeToken: () => `token${String(++n).padStart(17, "0")}`,
    now: () => clock,
    waitMs: 40,
    online: () => true,
  });
  return {
    session,
    stores,
    removed,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

/** Lets settled promises' callbacks run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("what each share leaves behind", () => {
  it("links to the card once its copy is kept, and keeps the page when shared", async () => {
    const { session, stores, removed } = harness();
    const share = session.begin(COPY, SOURCES);
    await expect(share.link(FALLBACK)).resolves.toBe(
      sharedCardUrl("token00000000000000001")
    );
    share.finish("shared");
    await settle();
    expect(stores).toEqual(["token00000000000000001"]);
    expect(removed).toEqual([]);
    // The next share from the same sheet gets a page of its own, and
    // closing the sheet takes back only a copy no one was sent.
    const next = session.begin(COPY, SOURCES);
    await expect(next.link(FALLBACK)).resolves.toBe(
      sharedCardUrl("token00000000000000002")
    );
    next.finish("cancelled");
    session.close();
    await settle();
    expect(removed).toEqual(["token00000000000000002"]);
  });

  it("takes the copy back when the share is cancelled", async () => {
    const { session, removed } = harness();
    const share = session.begin(COPY, SOURCES);
    await share.link(FALLBACK);
    share.finish("cancelled");
    await settle();
    expect(removed).toEqual(["token00000000000000001"]);
  });

  it("uses the invite link when the copy is refused, and takes nothing back", async () => {
    const { session, removed } = harness(async () => false);
    const share = session.begin(COPY, SOURCES);
    await expect(share.link(FALLBACK)).resolves.toBe(FALLBACK);
    share.finish("shared");
    await settle();
    expect(removed).toEqual([]);
  });

  it("stops waiting at the tap's limit, and takes back a copy kept too late", async () => {
    let keep: (kept: boolean) => void = () => {};
    const { session, removed } = harness(
      () => new Promise<boolean>((resolve) => (keep = resolve))
    );
    const share = session.begin(COPY, SOURCES);
    await expect(share.link(FALLBACK)).resolves.toBe(FALLBACK);
    share.finish("shared");
    keep(true);
    await settle();
    expect(removed).toEqual(["token00000000000000001"]);
  });

  it("waits no longer than the tap allows when the drawing used the time", async () => {
    let keep: (kept: boolean) => void = () => {};
    const { session, advance } = harness(
      () => new Promise<boolean>((resolve) => (keep = resolve))
    );
    const share = session.begin(COPY, SOURCES);
    advance(5000);
    const started = Date.now();
    await expect(share.link(FALLBACK)).resolves.toBe(FALLBACK);
    expect(Date.now() - started).toBeLessThan(40);
    keep(true);
  });

  it("keeps the copy for the next tap when the sheet refused, and needs no second store", async () => {
    const { session, stores, removed } = harness();
    const first = session.begin(COPY, SOURCES);
    await first.link(FALLBACK);
    first.finish("failed");
    const again = session.begin(COPY, SOURCES);
    await expect(again.link(FALLBACK)).resolves.toBe(
      sharedCardUrl("token00000000000000001")
    );
    again.finish("shared");
    await settle();
    expect(stores).toEqual(["token00000000000000001"]);
    expect(removed).toEqual([]);
  });

  it("gives other choices a new token, taking the first copy back", async () => {
    const { session, stores, removed } = harness();
    const first = session.begin(COPY, SOURCES);
    await first.link(FALLBACK);
    first.finish("failed");
    const changed = session.begin(OTHER, SOURCES);
    await expect(changed.link(FALLBACK)).resolves.toBe(
      sharedCardUrl("token00000000000000002")
    );
    await settle();
    expect(stores).toEqual([
      "token00000000000000001",
      "token00000000000000002",
    ]);
    expect(removed).toEqual(["token00000000000000001"]);
  });

  it("takes back a copy no one was sent when the sheet closes", async () => {
    const { session, removed } = harness();
    const share = session.begin(COPY, SOURCES);
    await share.link(FALLBACK);
    share.finish("failed");
    session.close();
    await settle();
    expect(removed).toEqual(["token00000000000000001"]);
  });

  it("takes back the copy of a card sent to Instagram, which carries no words", async () => {
    const { session, removed } = harness();
    const share = session.begin(COPY, SOURCES);
    share.finish("unused");
    await settle();
    expect(removed).toEqual(["token00000000000000001"]);
  });

  it("tries nothing offline, or for a card with no page", async () => {
    const store = vi.fn(async () => true);
    const offline = cardLinkSession({
      store,
      remove: async () => {},
      online: () => false,
    });
    await expect(offline.begin(COPY, SOURCES).link(FALLBACK)).resolves.toBe(
      FALLBACK
    );
    const online = cardLinkSession({ store, remove: async () => {} });
    await expect(online.begin(null, SOURCES).link(undefined)).resolves.toBe(
      undefined
    );
    expect(store).not.toHaveBeenCalled();
  });
});
