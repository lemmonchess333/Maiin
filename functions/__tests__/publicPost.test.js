/**
 * A shared post's public page (App1 Q51): who is shown, what is handed
 * out, and the page a pasted link previews. Driven through the handler
 * Hosting's /activity/** rewrite calls, with a synthetic req/res.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const {
  DATA_ELEMENT_ID,
  PUBLIC_ORIGIN,
  SECURITY_HEADERS,
  SHELL_TTL_MS,
  servePublicPost,
  shellLoader,
} = require("../lib/publicPost");

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="description"
      content="The fitness app for hybrid athletes."
    />
    <meta property="og:title" content="Tropos — Adaptive Fitness" />
    <meta property="og:url" content="https://troposfit.com/" />
    <meta name="twitter:card" content="summary" />
    <title>Tropos</title>
    <script src="/init.js"></script>
  </head>
  <body><div id="root"></div></body>
</html>`;

const PHOTO =
  "https://firebasestorage.googleapis.com/v0/b/adaptive-fitness-af8bb.firebasestorage.app/o/profile-photos%2Fsam.jpg?alt=media";

function run(overrides = {}) {
  return {
    authorId: "sam",
    authorName: "Sam old",
    type: "run",
    visibility: "public",
    createdAt: new Date("2026-11-12T07:10:00Z"),
    runName: "Long run",
    distance: 10210,
    duration: 3130,
    avgPace: 306,
    elevationGain: 84,
    routePreview: [{ lat: 51.5, lon: -0.12 }],
    caption: "Felt good",
    kudosCount: 3,
    commentCount: 1,
    ...overrides,
  };
}

function seed(extra = {}) {
  return {
    "users/sam": { preferredDistanceUnit: "km", email: "sam@example.com" },
    "users/sam/public/profile": { displayName: "Sam", photoURL: PHOTO },
    "activities/run1": run(),
    ...extra,
  };
}

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

async function ask(db, path, { query = {}, method = "GET", shell } = {}) {
  const res = makeRes();
  const loadShell =
    shell === undefined
      ? async () => SHELL
      : shell === null
        ? async () => {
            throw new Error("down");
          }
        : async () => shell;
  await servePublicPost({ method, path, query }, res, { db, loadShell });
  return res;
}

async function answer(db, id) {
  const res = await ask(db, `/activity/${id}`, { query: { format: "json" } });
  return res;
}

/** The data block the page reads, parsed back out of the HTML. */
function dataBlock(html) {
  const match = new RegExp(
    `<script type="application/json" id="${DATA_ELEMENT_ID}">([\\s\\S]*?)</script>`
  ).exec(html);
  return match ? JSON.parse(match[1]) : null;
}

describe("who a public post is shown to", () => {
  it("shows a public run with only the card's figures", async () => {
    const res = await answer(memoryFirestore(seed()), "run1");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      id: "run1",
      available: true,
      post: {
        id: "run1",
        type: "run",
        authorName: "Sam",
        authorPhotoURL: PHOTO,
        unit: "km",
        liftUnit: "kg",
        title: "Long run",
        createdAt: Date.parse("2026-11-12T07:10:00Z"),
        durationSec: 3130,
        distanceM: 10210,
        paceSecPerKm: 306,
        elevationM: 84,
        summary: "Long run: 10.21 km in 52:10 at 5:06 /km.",
      },
    });
  });

  it("never hands out the route, the caption, the counts or the author's id", async () => {
    const res = await answer(memoryFirestore(seed()), "run1");
    const out = JSON.stringify(res.body);
    for (const field of [
      "routePreview",
      "routeMap",
      "lat",
      "caption",
      "kudosCount",
      "commentCount",
      "authorId",
      "email",
    ]) {
      expect(out).not.toContain(field);
    }
    expect(out).not.toContain("sam@example.com");
  });

  it.each([
    ["followers-only", { "activities/run1": run({ visibility: "followers" }) }],
    ["private", { "activities/run1": run({ visibility: "private" }) }],
    ["flagged", { "activities/run1": run({ flagged: true }) }],
    ["missing", { "activities/run1": undefined }],
    ["restricted", { "globalRestrictedUids/sam": { at: 1 } }],
    ["deleted", { "users/sam": undefined }],
    ["being deleted", { "accountDeletionRequests/sam": { status: "running" } }],
    ["tombstoned", { "deletedAccounts/sam": {} }],
  ])("answers a %s post as one that does not exist", async (_case, extra) => {
    const data = seed();
    for (const [path, value] of Object.entries(extra)) {
      if (value === undefined) delete data[path];
      else data[path] = value;
    }
    const res = await answer(memoryFirestore(data), "run1");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ id: "run1", available: false });
  });

  it("answers an address that is no post's the same way", async () => {
    const db = memoryFirestore(seed());
    const res = await ask(db, "/activity/a%2Fb", { query: { format: "json" } });
    expect(res.body).toEqual({ id: "", available: false });
  });

  it("fails closed when the restriction cannot be read", async () => {
    const db = memoryFirestore(seed());
    db.failures.set("get:globalRestrictedUids/sam", new Error("unavailable"));
    const res = await answer(db, "run1");
    expect(res.body).toEqual({ id: "run1", available: false });
  });

  it("says it could not tell, rather than not shown, when the post cannot be read", async () => {
    const db = memoryFirestore(seed());
    db.failures.set("get:activities/run1", new Error("unavailable"));
    const res = await answer(db, "run1");
    expect(res.statusCode).toBe(503);
  });
});

describe("a workout's figures", () => {
  it("are its volume, exercises and bests, in the author's units", async () => {
    const db = memoryFirestore(
      seed({
        "users/sam": { liftingWeightUnit: "lbs" },
        "activities/lift1": {
          authorId: "sam",
          authorName: "Sam",
          type: "workout",
          visibility: "public",
          workoutName: "Push A",
          totalVolume: 4200,
          exerciseCount: 6,
          exercises: [{ name: "Bench press", summary: "3 × 5" }],
          prCount: 2,
          prExercise: "Bench press",
          duration: 2700,
        },
      })
    );
    const res = await answer(db, "lift1");
    expect(res.body.post).toMatchObject({
      type: "workout",
      title: "Push A",
      liftUnit: "lbs",
      totalVolumeKg: 4200,
      exerciseCount: 6,
      prCount: 2,
      prExercise: "Bench press",
      durationSec: 2700,
      summary: "Push A: 9,259 lb lifted across 6 exercises, 2 new bests.",
    });
    expect(JSON.stringify(res.body)).not.toContain("3 × 5");
  });
});

describe("the page Hosting serves", () => {
  it("names the post in its head and carries its figures", async () => {
    const res = await ask(memoryFirestore(seed()), "/activity/run1");
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("text/html; charset=utf-8");
    const html = res.body;
    expect(html).toContain(
      '<meta property="og:title" content="Sam’s run on Tropos" />'
    );
    expect(html).toContain(
      '<meta property="og:description" content="Long run: 10.21 km in 52:10 at 5:06 /km." />'
    );
    expect(html).toContain(
      `<meta property="og:url" content="${PUBLIC_ORIGIN}/activity/run1" />`
    );
    expect(html).toContain(
      `<meta property="og:image" content="${PUBLIC_ORIGIN}/icons/icon-512x512.png" />`
    );
    // The app's own preview is replaced, not repeated.
    expect(html).not.toContain("Tropos — Adaptive Fitness");
    expect(html).not.toContain("The fitness app for hybrid athletes.");
    expect(html.match(/og:title/g)).toHaveLength(1);
    // Safari's banner: Open on a phone with Tropos, which hands the app
    // this address; Get without it.
    expect(html).toContain(
      `<meta name="apple-itunes-app" content="app-id=6762416918, app-argument=${PUBLIC_ORIGIN}/activity/run1" />`
    );
    // The rest of the page is the app's.
    expect(html).toContain('<script src="/init.js"></script>');
    expect(html).toContain('<div id="root"></div>');
    expect(dataBlock(html)).toMatchObject({
      id: "run1",
      available: true,
      post: { authorName: "Sam", distanceM: 10210 },
    });
  });

  it("keeps the app's own preview for a post it does not show", async () => {
    const data = seed();
    data["activities/run1"] = run({ visibility: "followers" });
    const res = await ask(memoryFirestore(data), "/activity/run1");
    expect(res.body).toContain("Tropos — Adaptive Fitness");
    expect(res.body).not.toContain("Long run");
    expect(res.body).not.toContain("Sam");
    expect(dataBlock(res.body)).toEqual({ id: "run1", available: false });
  });

  it("cannot be broken out of by a title", async () => {
    const data = seed();
    data["activities/run1"] = run({
      runName: '</script><script>alert(1)</script>"><b>',
    });
    const res = await ask(memoryFirestore(data), "/activity/run1");
    expect(res.body).not.toContain("<script>alert(1)");
    expect(res.body).not.toContain('"><b>');
    expect(dataBlock(res.body).post.title).toBe(
      '</script><script>alert(1)</script>"><b>'
    );
  });

  it("still gives a preview when the app's page cannot be fetched", async () => {
    const res = await ask(memoryFirestore(seed()), "/activity/run1", {
      shell: null,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Sam’s run on Tropos");
    expect(res.body).toContain(`href="${PUBLIC_ORIGIN}/"`);
  });

  it("is never cached by Hosting and carries Hosting's security headers", async () => {
    const res = await ask(memoryFirestore(seed()), "/activity/run1");
    expect(res.headers["Cache-Control"]).toBe("no-cache");
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      expect(res.headers[key]).toBe(value);
    }
  });

  it("holds the security headers to firebase.json's", () => {
    const hosting = JSON.parse(
      readFileSync(resolve(repoRoot, "firebase.json"), "utf8")
    ).hosting;
    const all = hosting.headers.find((rule) => rule.source === "**");
    expect(
      Object.fromEntries(all.headers.map((h) => [h.key, h.value]))
    ).toEqual(SECURITY_HEADERS);
    expect(hosting.rewrites[0]).toEqual({
      source: "/activity/**",
      function: { functionId: "publicPostPage", region: "us-central1" },
    });
  });

  it("refuses anything but reading", async () => {
    const res = await ask(memoryFirestore(seed()), "/activity/run1", {
      method: "POST",
    });
    expect(res.statusCode).toBe(405);
  });
});

describe("the app's page, fetched from Hosting", () => {
  it("is kept for a minute, and the last copy used when a fetch fails", async () => {
    let now = 0;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, text: async () => SHELL })
      .mockRejectedValueOnce(new Error("down"));
    const load = shellLoader({ fetchImpl, now: () => now });
    expect(await load()).toBe(SHELL);
    now = SHELL_TTL_MS - 1;
    expect(await load()).toBe(SHELL);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(`${PUBLIC_ORIGIN}/index.html`);
    now = SHELL_TTL_MS + 1;
    expect(await load()).toBe(SHELL);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws when there is no copy at all", async () => {
    const load = shellLoader({
      fetchImpl: async () => ({ ok: false, status: 404, text: async () => "" }),
    });
    await expect(load()).rejects.toThrow("404");
  });
});
