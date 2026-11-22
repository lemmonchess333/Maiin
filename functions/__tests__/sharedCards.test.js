/**
 * A shared card's page (Soc17 calls 1 to 3): what a stored copy may hold,
 * who may keep and take one back, when it goes, and the page a pasted
 * link opens. The page is driven through the handler Hosting's /card/**
 * rewrite calls, with a synthetic req/res, over an in-memory Firestore.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const {
  SHARED_CARDS,
  UNSOURCED_CARD_DAYS,
  cardCopy,
  storeSharedCard,
  removeSharedCard,
  removeCardsShowing,
  cardSummary,
  readSharedCard,
} = require("../lib/sharedCards");
const {
  CARD_DATA_ELEMENT_ID,
  serveSharedCard,
  tokenFromPath,
} = require("../lib/sharedCardPage");
const { SECURITY_HEADERS } = require("../lib/publicPost");
const profanityFilter = require("../profanityFilter");

const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";
const OTHER_TOKEN = "zYxWvUtSrQpOnMlKjIhGfE";
const NOW = new Date("2026-11-22T09:00:00Z");

function liftCard(overrides = {}) {
  return {
    template: "lift",
    format: "story",
    background: "brand",
    unit: "km",
    liftUnit: "kg",
    date: "22 Nov 2026",
    hiddenStats: [],
    headline: "Push A done",
    line: "Your best bench press: 80 kg, 2.5 kg up on last time.",
    tone: "achievement",
    totalVolumeKg: 7470,
    totalReps: 96,
    durationSec: 2460,
    exerciseCount: 6,
    prCount: 1,
    prExercise: "Bench press",
    ...overrides,
  };
}

function runCard(overrides = {}) {
  return {
    template: "run",
    format: "square",
    background: "brand",
    unit: "km",
    liftUnit: "kg",
    date: "21 Nov 2026",
    hiddenStats: [],
    headline: "Long run",
    distanceKm: 10.21,
    durationSec: 3130,
    paceSecPerKm: 306,
    elevationM: 84,
    splits: [
      { lap: 1, paceSecPerKm: 310 },
      { lap: 2, paceSecPerKm: 302 },
    ],
    ...overrides,
  };
}

function seed(extra = {}) {
  return {
    "users/sam": { inviteCode: "K7P49M2H", email: "sam@example.com" },
    "users/sam/public/profile": {
      displayName: "Sam Rivers",
      photoURL: "https://example.com/sam.jpg",
    },
    "users/sam/workouts/w1": { dayName: "Push A" },
    "users/sam/runs/r1": { distance: 10210 },
    "inviteCodes/K7P49M2H": { uid: "sam", createdAt: NOW },
    "activities/p1": {
      authorId: "sam",
      type: "workout",
      visibility: "followers",
    },
    "users/bo": {},
    "users/bo/workouts/w1": { dayName: "Bo's day" },
    ...extra,
  };
}

function store(db, overrides = {}) {
  return storeSharedCard({
    firestore: db,
    uid: "sam",
    token: TOKEN,
    card: liftCard(),
    sources: { workoutId: "w1" },
    createdAt: NOW,
    containsProfanity: profanityFilter.containsProfanity,
    inviteCodeFor: async () => "K7P49M2H",
    ...overrides,
  });
}

describe("the copy a card keeps", () => {
  it("keeps the card's figures and words as drawn, and nothing else", () => {
    const copy = cardCopy(
      {
        ...runCard(),
        handle: "Sam Rivers",
        photoUrl: "data:image/png;base64,AAAA",
        routePath: "M 0 0 L 10 10",
        points: [{ lat: 51.5, lon: -0.12 }],
        artSrc: "/form-art/bench-press.webp",
        uid: "sam",
        totalVolumeKg: 999,
      },
      profanityFilter.containsProfanity
    );
    expect(copy).toEqual({
      template: "run",
      format: "square",
      background: "brand",
      unit: "km",
      liftUnit: "kg",
      hiddenStats: [],
      date: "21 Nov 2026",
      headline: "Long run",
      distanceKm: 10.21,
      durationSec: 3130,
      paceSecPerKm: 306,
      elevationM: 84,
      splits: [
        { lap: 1, paceSecPerKm: 310 },
        { lap: 2, paceSecPerKm: 302 },
      ],
    });
    const out = JSON.stringify(copy);
    for (const word of [
      "Sam",
      "route",
      "M 0 0",
      '"lat"',
      "data:",
      "form-art",
    ]) {
      expect(out).not.toContain(word);
    }
  });

  it("leaves out the figures a toggle hid", () => {
    const copy = cardCopy(
      liftCard({ hiddenStats: ["volume", "prs", "nonsense"] }),
      profanityFilter.containsProfanity
    );
    expect(copy.hiddenStats).toEqual(["prs", "volume"]);
    for (const key of ["totalVolumeKg", "totalReps", "prCount", "prExercise"]) {
      expect(copy).not.toHaveProperty(key);
    }
    expect(copy.exerciseCount).toBe(6);
    expect(copy.durationSec).toBe(2460);
  });

  it("keeps a lift's drawing as a released cut-out's id, never an address", () => {
    expect(cardCopy(liftCard({ art: "bench-press" })).art).toBe("bench-press");
    for (const art of [
      "https://evil.example/x.png",
      "/form-art/bench-press.webp",
      "not-a-cutout",
      "constructor",
      42,
    ]) {
      expect(cardCopy(liftCard({ art }))).not.toHaveProperty("art");
    }
    // Only a lift card draws one.
    expect(cardCopy(runCard({ art: "bench-press" }))).not.toHaveProperty("art");
  });

  it("reads only a toggle's own keys, never one an object inherits", () => {
    const copy = cardCopy(
      liftCard({ hiddenStats: ["constructor", "toString", "__proto__", "prs"] })
    );
    expect(copy.hiddenStats).toEqual(["prs"]);
    expect(copy.totalVolumeKg).toBe(7470);
    expect(cardCopy(liftCard({ template: "constructor" }))).toBeNull();
  });

  it("draws a photo's card on the brand's stage", () => {
    expect(cardCopy(liftCard({ background: "photo" })).background).toBe(
      "brand"
    );
    expect(cardCopy(liftCard({ background: "dark" })).background).toBe("dark");
  });

  it("leaves off words the filter refuses, and a date that is not one", () => {
    const copy = cardCopy(
      liftCard({
        headline: "fuck this",
        prExercise: "shit press",
        date: "<script>",
      }),
      profanityFilter.containsProfanity
    );
    expect(copy).not.toHaveProperty("headline");
    expect(copy).not.toHaveProperty("prExercise");
    expect(copy).not.toHaveProperty("date");
    expect(copy.line).toMatch(/bench press/);
  });

  it("refuses what no template draws", () => {
    expect(cardCopy(null)).toBeNull();
    expect(cardCopy([])).toBeNull();
    expect(cardCopy({ ...liftCard(), template: "anniversary" })).toBeNull();
    expect(cardCopy({ ...liftCard(), headline: "x".repeat(5000) })).toBeNull();
  });

  it("drops a number out of range and splits that are not splits", () => {
    const copy = cardCopy(
      runCard({
        distanceKm: -1,
        paceSecPerKm: Number.NaN,
        splits: [{ lap: 1, paceSecPerKm: "5:10" }],
      })
    );
    expect(copy).not.toHaveProperty("distanceKm");
    expect(copy).not.toHaveProperty("paceSecPerKm");
    expect(copy).not.toHaveProperty("splits");
  });
});

describe("keeping a copy", () => {
  it("keeps the caller's card under its token, with the code they have now", async () => {
    const db = memoryFirestore(seed());
    await expect(store(db)).resolves.toEqual({ stored: true });
    expect(db.data.get(`${SHARED_CARDS}/${TOKEN}`)).toEqual({
      ownerUid: "sam",
      workoutId: "w1",
      card: cardCopy(liftCard(), profanityFilter.containsProfanity),
      createdAt: NOW,
      inviteCode: "K7P49M2H",
    });
  });

  it("keeps it without a code when none can be had", async () => {
    const db = memoryFirestore(seed());
    await store(db, {
      inviteCodeFor: async () => {
        throw new Error("down");
      },
    });
    expect(db.data.get(`${SHARED_CARDS}/${TOKEN}`)).not.toHaveProperty(
      "inviteCode"
    );
  });

  it("replaces the caller's own copy under the same token, keeping when it was first kept", async () => {
    const db = memoryFirestore(seed());
    await store(db);
    await store(db, {
      card: liftCard({ format: "square" }),
      createdAt: new Date("2026-11-22T09:05:00Z"),
    });
    const kept = db.data.get(`${SHARED_CARDS}/${TOKEN}`);
    expect(kept.card.format).toBe("square");
    expect(kept.createdAt).toEqual(NOW);
  });

  it("refuses a token someone else holds", async () => {
    const db = memoryFirestore(
      seed({
        [`${SHARED_CARDS}/${TOKEN}`]: { ownerUid: "bo", card: liftCard() },
      })
    );
    await expect(store(db)).rejects.toMatchObject({ code: "already-exists" });
    expect(db.data.get(`${SHARED_CARDS}/${TOKEN}`).ownerUid).toBe("bo");
  });

  it.each([
    ["a workout of someone else's", { workoutId: "nope" }],
    ["a post by someone else", { postId: "p2" }],
    ["a flagged post", { postId: "p3" }],
    ["a deleted run", { runId: "gone" }],
  ])("refuses %s", async (_case, sources) => {
    const db = memoryFirestore(
      seed({
        "activities/p2": { authorId: "bo", type: "workout" },
        "activities/p3": { authorId: "sam", type: "workout", flagged: true },
      })
    );
    await expect(store(db, { sources })).rejects.toMatchObject({
      code: "not-found",
    });
    expect(db.data.has(`${SHARED_CARDS}/${TOKEN}`)).toBe(false);
  });

  it("asks a run or lift card for the session it shows, and a week for none", async () => {
    const db = memoryFirestore(seed());
    await expect(store(db, { sources: {} })).rejects.toMatchObject({
      code: "invalid-argument",
    });
    await expect(
      store(db, {
        card: { template: "recap", sessionsCount: 5, hiddenStats: [] },
        sources: {},
      })
    ).resolves.toEqual({ stored: true });
  });

  it("gives a card that shows nothing deletable 30 days, from when it was first kept", async () => {
    const db = memoryFirestore(seed());
    const nowMs = NOW.getTime();
    const week = { template: "recap", sessionsCount: 5, hiddenStats: [] };
    await store(db, { card: week, sources: {}, nowMs });
    const kept = db.data.get(`${SHARED_CARDS}/${TOKEN}`);
    expect(UNSOURCED_CARD_DAYS).toBe(30);
    expect(kept.expiresAt).toEqual(new Date(nowMs + 30 * 86_400_000));
    // Other choices a day later keep the first day's 30.
    await store(db, {
      card: { ...week, format: "square" },
      sources: {},
      nowMs: nowMs + 86_400_000,
    });
    expect(db.data.get(`${SHARED_CARDS}/${TOKEN}`).expiresAt).toEqual(
      new Date(nowMs + 30 * 86_400_000)
    );
    // A card of a session lives as long as the session.
    await store(db, { token: OTHER_TOKEN, nowMs });
    expect(db.data.get(`${SHARED_CARDS}/${OTHER_TOKEN}`)).not.toHaveProperty(
      "expiresAt"
    );
  });

  it("has Firestore's TTL policy delete it, as the pulse's days are", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const { fieldOverrides } = JSON.parse(
      readFileSync(resolve(root, "firestore.indexes.json"), "utf8")
    );
    expect(
      fieldOverrides.some(
        (o) =>
          o.collectionGroup === SHARED_CARDS &&
          o.fieldPath === "expiresAt" &&
          o.ttl === true
      )
    ).toBe(true);
  });

  it("refuses a token that is not 128 bits written out, and a card it cannot draw", async () => {
    const db = memoryFirestore(seed());
    for (const token of ["short", "../users/sam", `${TOKEN}x`, 12]) {
      await expect(store(db, { token })).rejects.toMatchObject({
        code: "invalid-argument",
      });
    }
    await expect(store(db, { card: { template: "x" } })).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("refuses an account being deleted, read in the transaction that writes", async () => {
    const db = memoryFirestore(
      seed({ "accountDeletionRequests/sam": { status: "running" } })
    );
    await expect(store(db)).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(db.data.has(`${SHARED_CARDS}/${TOKEN}`)).toBe(false);
  });
});

describe("taking a copy back", () => {
  it("removes the caller's own and leaves anyone else's", async () => {
    const db = memoryFirestore(
      seed({
        [`${SHARED_CARDS}/${TOKEN}`]: { ownerUid: "sam", card: liftCard() },
        [`${SHARED_CARDS}/${OTHER_TOKEN}`]: {
          ownerUid: "bo",
          card: liftCard(),
        },
      })
    );
    await expect(
      removeSharedCard({ firestore: db, uid: "sam", token: TOKEN })
    ).resolves.toEqual({ removed: true });
    await expect(
      removeSharedCard({ firestore: db, uid: "sam", token: OTHER_TOKEN })
    ).resolves.toEqual({ removed: false });
    expect(db.data.has(`${SHARED_CARDS}/${TOKEN}`)).toBe(false);
    expect(db.data.has(`${SHARED_CARDS}/${OTHER_TOKEN}`)).toBe(true);
  });
});

describe("a copy goes with what it shows", () => {
  const copies = {
    [`${SHARED_CARDS}/samWorkout000000000001`]: {
      ownerUid: "sam",
      workoutId: "w1",
    },
    [`${SHARED_CARDS}/samPost000000000000001`]: {
      ownerUid: "sam",
      postId: "p1",
      workoutId: "w9",
    },
    [`${SHARED_CARDS}/samRun0000000000000001`]: {
      ownerUid: "sam",
      runId: "r1",
    },
    [`${SHARED_CARDS}/boWorkout00000000000001`]: {
      ownerUid: "bo",
      workoutId: "w1",
    },
  };

  it("takes the owner's copies of a deleted workout, never another person's with the same id", async () => {
    const db = memoryFirestore(copies);
    await expect(
      removeCardsShowing({
        firestore: db,
        field: "workoutId",
        id: "w1",
        uid: "sam",
      })
    ).resolves.toBe(1);
    expect(db.data.has(`${SHARED_CARDS}/samWorkout000000000001`)).toBe(false);
    expect(db.data.has(`${SHARED_CARDS}/boWorkout00000000000001`)).toBe(true);
  });

  it("takes every copy of a deleted post", async () => {
    const db = memoryFirestore(copies);
    await expect(
      removeCardsShowing({ firestore: db, field: "postId", id: "p1" })
    ).resolves.toBe(1);
    expect(db.data.has(`${SHARED_CARDS}/samPost000000000000001`)).toBe(false);
  });

  it("takes a deleted run's", async () => {
    const db = memoryFirestore(copies);
    await removeCardsShowing({
      firestore: db,
      field: "runId",
      id: "r1",
      uid: "sam",
    });
    expect(db.data.has(`${SHARED_CARDS}/samRun0000000000000001`)).toBe(false);
  });

  it("does nothing for a field that names nothing", async () => {
    const db = memoryFirestore(copies);
    await expect(
      removeCardsShowing({ firestore: db, field: "ownerUid", id: "sam" })
    ).resolves.toBe(0);
    expect(db.data.size).toBe(Object.keys(copies).length);
  });
});

describe("the card's sentence", () => {
  it("says only what the card shows, in the sharer's units", () => {
    expect(cardSummary(cardCopy(runCard()))).toBe(
      "Long run: 10.21 km in 52:10 at 5:06 /km."
    );
    expect(
      cardSummary(cardCopy(runCard({ hiddenStats: ["distance", "pace"] })))
    ).toBe("Long run: 52:10.");
    expect(cardSummary(cardCopy(liftCard()))).toBe(
      "Push A done: 7,470 kg lifted across 6 exercises with 1 new best."
    );
    expect(
      cardSummary(cardCopy(liftCard({ liftUnit: "lbs", hiddenStats: ["prs"] })))
    ).toBe("Push A done: 16,469 lb lifted across 6 exercises.");
    expect(
      cardSummary(
        cardCopy({
          template: "recap",
          unit: "mi",
          recapTitle: "This year",
          sessionsCount: 180,
          distanceKm: 1609.344,
          streakDays: 12,
        })
      )
    ).toBe("This year: 180 sessions, 1000.00 mi run, a 12-day streak.");
    expect(
      cardSummary(
        cardCopy({
          template: "nutrition",
          calories: 2150,
          calorieTarget: 2400,
          protein: 150,
          carbs: 210,
          fat: 70,
        })
      )
    ).toBe("2,150 of 2,400 kcal with 150 g protein, 210 g carbs and 70 g fat.");
  });
});

function kept(extra = {}) {
  return seed({
    [`${SHARED_CARDS}/${TOKEN}`]: {
      ownerUid: "sam",
      workoutId: "w1",
      card: cardCopy(liftCard()),
      inviteCode: "K7P49M2H",
      createdAt: NOW,
    },
    ...extra,
  });
}

describe("who a card's page is shown to", () => {
  it("shows the card, the sharer's first name and their code", async () => {
    const view = await readSharedCard(memoryFirestore(kept()), TOKEN);
    expect(view).toEqual({
      token: TOKEN,
      card: cardCopy(liftCard()),
      firstName: "Sam",
      inviteCode: "K7P49M2H",
      summary:
        "Push A done: 7,470 kg lifted across 6 exercises with 1 new best.",
    });
    const out = JSON.stringify(view);
    for (const leak of [
      "sam@example.com",
      "Rivers",
      "sam.jpg",
      "ownerUid",
      "w1",
    ]) {
      expect(out).not.toContain(leak);
    }
  });

  it("draws a lift's drawing from the website's own copy of the cut-out", async () => {
    const view = await readSharedCard(
      memoryFirestore(
        kept({
          [`${SHARED_CARDS}/${TOKEN}`]: {
            ownerUid: "sam",
            workoutId: "w1",
            card: cardCopy(liftCard({ art: "bench-press" })),
            createdAt: NOW,
          },
        })
      ),
      TOKEN
    );
    expect(view.card.artSrc).toBe("/form-art/bench-press.webp");
    expect(view.card).not.toHaveProperty("art");
  });

  it("answers a card past its 30 days as one that does not exist", async () => {
    const week = {
      ownerUid: "sam",
      card: cardCopy({ template: "recap", sessionsCount: 5, hiddenStats: [] }),
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 30 * 86_400_000),
    };
    const db = memoryFirestore(kept({ [`${SHARED_CARDS}/${TOKEN}`]: week }));
    const before = NOW.getTime() + 30 * 86_400_000 - 1;
    await expect(
      readSharedCard(db, TOKEN, undefined, before)
    ).resolves.toMatchObject({ token: TOKEN });
    await expect(
      readSharedCard(db, TOKEN, undefined, before + 1)
    ).resolves.toBe(null);
    // A time it cannot read is past.
    const broken = memoryFirestore(
      kept({ [`${SHARED_CARDS}/${TOKEN}`]: { ...week, expiresAt: "soon" } })
    );
    await expect(readSharedCard(broken, TOKEN)).resolves.toBe(null);
  });

  it("leaves the code off once it is no longer theirs", async () => {
    const view = await readSharedCard(
      memoryFirestore(kept({ "inviteCodes/K7P49M2H": undefined })),
      TOKEN
    );
    expect(view).not.toHaveProperty("inviteCode");
    const renewed = await readSharedCard(
      memoryFirestore(
        kept({ "inviteCodes/K7P49M2H": { uid: "bo", createdAt: NOW } })
      ),
      TOKEN
    );
    expect(renewed).not.toHaveProperty("inviteCode");
  });

  it.each([
    ["unknown", { [`${SHARED_CARDS}/${TOKEN}`]: undefined }],
    ["of a deleted workout", { "users/sam/workouts/w1": undefined }],
    ["restricted", { "globalRestrictedUids/sam": { at: 1 } }],
    ["being deleted", { "accountDeletionRequests/sam": { status: "running" } }],
    ["tombstoned", { "deletedAccounts/sam": {} }],
    ["gone", { "users/sam": undefined }],
  ])("answers a card %s as one that does not exist", async (_case, extra) => {
    const data = kept();
    for (const [path, value] of Object.entries(extra)) {
      if (value === undefined) delete data[path];
      else data[path] = value;
    }
    await expect(readSharedCard(memoryFirestore(data), TOKEN)).resolves.toBe(
      null
    );
  });

  it("fails closed when the restriction cannot be read", async () => {
    const db = memoryFirestore(kept());
    db.failures.set("get:globalRestrictedUids/sam", new Error("unavailable"));
    await expect(readSharedCard(db, TOKEN)).resolves.toBe(null);
  });
});

function makeRes() {
  return {
    statusCode: undefined,
    body: undefined,
    headers: {},
    set(key, value) {
      this.headers[key] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="description" content="The website." />
    <meta property="og:title" content="Tropos" />
    <title>Tropos</title>
  </head>
  <body><div id="root" data-page="home"></div></body>
</html>`;

async function ask(
  db,
  path,
  { query = {}, method = "GET", shell = SHELL } = {}
) {
  const res = makeRes();
  await serveSharedCard({ method, path, query }, res, {
    db,
    loadShell: async () => {
      if (shell === null) throw new Error("down");
      return shell;
    },
    containsProfanity: profanityFilter.containsProfanity,
  });
  return res;
}

function dataBlock(html) {
  const match = new RegExp(
    `<script type="application/json" id="${CARD_DATA_ELEMENT_ID}">([\\s\\S]*?)</script>`
  ).exec(html);
  return match ? JSON.parse(match[1]) : null;
}

describe("the page a card's link opens", () => {
  it("reads only a token from its address", () => {
    expect(tokenFromPath(`/card/${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromPath(`/card/${TOKEN}/`)).toBe(TOKEN);
    expect(tokenFromPath("/card/short")).toBeNull();
    expect(tokenFromPath(`/card/${TOKEN}/x`)).toBeNull();
  });

  it("is the website's page with the card, kept out of search, with Safari's banner", async () => {
    const res = await ask(memoryFirestore(kept()), `/card/${TOKEN}`);
    expect(res.statusCode).toBe(200);
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      expect(res.headers[key]).toBe(value);
    }
    expect(res.headers["X-Robots-Tag"]).toBe("noindex");
    expect(res.headers["Cache-Control"]).toBe("no-cache");
    const html = res.body;
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).toContain(
      `<meta name="apple-itunes-app" content="app-id=6762416918, app-argument=https://troposfit.com/card/${TOKEN}" />`
    );
    expect(html).toContain(
      '<meta property="og:title" content="Sam’s workout on Tropos" />'
    );
    expect(html).toContain(
      '<meta property="og:image" content="https://troposfit.com/icons/icon-512x512.png" />'
    );
    expect(html).not.toContain("The website.");
    expect(dataBlock(html)).toEqual({
      token: TOKEN,
      available: true,
      view: await readSharedCard(memoryFirestore(kept()), TOKEN),
    });
    expect(html).toContain('data-page="home"');
  });

  it("answers an unavailable card without naming it or its sharer", async () => {
    const res = await ask(
      memoryFirestore(kept({ "globalRestrictedUids/sam": { at: 1 } })),
      `/card/${TOKEN}`
    );
    expect(res.statusCode).toBe(200);
    expect(dataBlock(res.body)).toEqual({ token: TOKEN, available: false });
    expect(res.body).not.toContain("Sam");
    expect(res.body).toContain("The website.");
    expect(res.headers["X-Robots-Tag"]).toBe("noindex");
  });

  it("answers ?format=json with the same, to any origin", async () => {
    const res = await ask(memoryFirestore(kept()), `/card/${TOKEN}`, {
      query: { format: "json" },
    });
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(res.body.available).toBe(true);
    const unknown = await ask(memoryFirestore(kept()), `/card/${OTHER_TOKEN}`, {
      query: { format: "json" },
    });
    expect(unknown.body).toEqual({ token: OTHER_TOKEN, available: false });
  });

  it("says it could not tell when the copy cannot be read", async () => {
    const db = memoryFirestore(kept());
    db.failures.set(`get:${SHARED_CARDS}/${TOKEN}`, new Error("unavailable"));
    const res = await ask(db, `/card/${TOKEN}`, { query: { format: "json" } });
    expect(res.statusCode).toBe(503);
    const page = await ask(db, `/card/${TOKEN}`);
    expect(dataBlock(page.body)).toBeNull();
    expect(page.body).toContain('<meta name="robots" content="noindex" />');
  });

  it("still previews and leads to Tropos when the website's page cannot be had", async () => {
    const res = await ask(memoryFirestore(kept()), `/card/${TOKEN}`, {
      shell: null,
    });
    expect(res.body).toContain("Sam’s workout on Tropos");
    expect(res.body).toContain('href="https://troposfit.com/"');
  });

  it("answers only GET and HEAD", async () => {
    const res = await ask(memoryFirestore(kept()), `/card/${TOKEN}`, {
      method: "POST",
    });
    expect(res.statusCode).toBe(405);
  });
});
