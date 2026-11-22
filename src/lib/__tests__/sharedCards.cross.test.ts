// @vitest-environment jsdom
/**
 * A shared card's page, the sheet, the server and the page (Soc17 call 1).
 *
 * The sheet builds a card's copy (src/lib/sharedCardShare.ts), the server
 * keeps it field by field (functions/lib/sharedCards.js) and writes it
 * into the page it serves (functions/lib/sharedCardPage.js), and the page
 * reads it back (src/lib/sharedCardPage.ts). If the sheet's list of what a
 * toggle hides drifted from the server's, a hidden figure would reach the
 * server; if the page's reader drifted from what the server writes, every
 * card would read "This card isn’t available", which looks exactly like
 * the privacy rule working. So each side's own output is fed to the next.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import type { ShareCardRenderData } from "@/components/share/ShareCardRenderer";
import { TOGGLEABLE_STATS } from "@/lib/shareCard/statToggles";
import { PUBLIC_APP_ORIGIN, sharedCardUrl } from "@/lib/publicLinks";
import {
  HIDDEN_FIGURES,
  SHARED_CARD_TOKEN,
  sharedCardCopy,
} from "@/lib/sharedCardShare";
import { SHARED_CARD_DATA_ID, loadSharedCard } from "@/lib/sharedCardPage";
import { FORM_ART_CUTOUTS } from "@/lib/formArtCutouts.data";
import {
  CARD_ART_FILES,
  websitePublicFiles,
} from "../../../scripts/website/websiteEntry";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/sharedCards.js");
const art = require("../../../functions/lib/cardArt.js");
const page = require("../../../functions/lib/sharedCardPage.js");
const profanity = require("../../../functions/profanityFilter.js");
const {
  memoryFirestore,
} = require("../../../functions/__tests__/helpers/memoryFirestore.cjs");

const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";
const SHELL =
  '<!doctype html><html><head><meta property="og:title" content="Tropos" /></head><body></body></html>';

const LIFT: ShareCardRenderData = {
  unit: "mi",
  liftUnit: "lbs",
  template: "lift",
  format: "square",
  background: "dark",
  handle: "Sam Rivers",
  date: "22 Nov 2026",
  hiddenStats: new Set(["prs"]),
  headline: "Push A done",
  line: "Your best bench press: 80 kg, 2.5 kg up on last time.",
  tone: "achievement",
  totalVolumeKg: 7470,
  totalReps: 96,
  exerciseCount: 6,
  durationSec: 2460,
  prCount: 1,
  prExercise: "Bench press",
  artSrc: "/form-art/bench-press.webp",
};

afterEach(() => {
  document.head.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("the sheet and the server agree on what a card keeps", () => {
  it("hide the same figures for the same toggles, which are the sheet's", () => {
    expect(HIDDEN_FIGURES).toEqual(server.HIDDEN_FIGURES);
    expect(Object.keys(server.HIDDEN_FIGURES).sort()).toEqual(
      [...server.TEMPLATES].sort()
    );
    for (const template of server.TEMPLATES as (keyof typeof HIDDEN_FIGURES)[]) {
      expect(Object.keys(HIDDEN_FIGURES[template]).sort(), template).toEqual(
        [...TOGGLEABLE_STATS[template]].sort()
      );
    }
  });

  it("read a token the same way", () => {
    expect(String(SHARED_CARD_TOKEN)).toBe(String(server.TOKEN_PATTERN));
    expect(sharedCardUrl(TOKEN)).toBe(`${PUBLIC_APP_ORIGIN}/card/${TOKEN}`);
    expect(page.tokenFromPath(new URL(sharedCardUrl(TOKEN)).pathname)).toBe(
      TOKEN
    );
  });

  it("keep the sheet's copy as it was sent", () => {
    const copy = sharedCardCopy(LIFT, "bench-press");
    expect(copy?.art).toBe("bench-press");
    expect(server.cardCopy(copy, profanity.containsProfanity)).toEqual(copy);
  });
});

describe("a card's drawing is one the website ships", () => {
  it("the server takes exactly the app's released cut-outs", () => {
    expect([...art.CARD_ART_IDS].sort()).toEqual(
      Object.keys(FORM_ART_CUTOUTS).sort()
    );
  });

  it("each is shipped to troposfit.com at the address the server names", () => {
    const shipped = new Set(websitePublicFiles(`${process.cwd()}/public`));
    for (const id of art.CARD_ART_IDS as string[]) {
      const src = art.cardArtSrc(id) as string;
      expect(src, id).toBe(`/${FORM_ART_CUTOUTS[id].src}`);
      expect(CARD_ART_FILES).toContain(src.slice(1));
      expect(shipped.has(src.slice(1)), src).toBe(true);
    }
  });
});

async function served(query: Record<string, string> = {}) {
  const db = memoryFirestore({
    "users/sam": { inviteCode: "K7P49M2H" },
    "users/sam/public/profile": { displayName: "Sam Rivers" },
    "users/sam/workouts/w1": {},
    "inviteCodes/K7P49M2H": { uid: "sam" },
  });
  await server.storeSharedCard({
    firestore: db,
    uid: "sam",
    token: TOKEN,
    card: sharedCardCopy(LIFT, "bench-press"),
    sources: { workoutId: "w1" },
    createdAt: new Date(),
    containsProfanity: profanity.containsProfanity,
    inviteCodeFor: async () => "K7P49M2H",
  });
  let body: unknown;
  const res = {
    set: () => res,
    status: () => res,
    send: (b: unknown) => {
      body = b;
      return res;
    },
    json: (b: unknown) => {
      body = b;
      return res;
    },
  };
  await page.serveSharedCard(
    { method: "GET", path: `/card/${TOKEN}`, query },
    res,
    { db, loadShell: async () => SHELL }
  );
  return body;
}

describe("the page reads what the server writes", () => {
  it("names the same block", () => {
    expect(page.CARD_DATA_ELEMENT_ID).toBe(SHARED_CARD_DATA_ID);
  });

  it("draws the card as sent, its drawing the website's own, with the first name in place of the handle", async () => {
    const html = (await served()) as string;
    document.head.innerHTML = new DOMParser().parseFromString(
      html,
      "text/html"
    ).head.innerHTML;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const view = await loadSharedCard(TOKEN);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(view).toMatchObject({
      token: TOKEN,
      firstName: "Sam",
      inviteCode: "K7P49M2H",
      summary: "Push A done: 16,469 lb lifted across 6 exercises.",
    });
    expect(view!.card).toEqual({
      template: "lift",
      format: "square",
      background: "dark",
      unit: "mi",
      liftUnit: "lbs",
      handle: "Sam",
      date: "22 Nov 2026",
      hiddenStats: new Set(["prs"]),
      headline: "Push A done",
      line: "Your best bench press: 80 kg, 2.5 kg up on last time.",
      tone: "achievement",
      totalVolumeKg: 7470,
      totalReps: 96,
      exerciseCount: 6,
      durationSec: 2460,
      artSrc: "/form-art/bench-press.webp",
    });
    // Taken once: a second look asks the server afresh.
    expect(document.getElementById(SHARED_CARD_DATA_ID)).toBeNull();
  });

  it("asks the server for the card when the page has no block", async () => {
    const answer = await served({ format: "json" });
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => answer,
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const view = await loadSharedCard(TOKEN);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${sharedCardUrl(TOKEN)}?format=json`,
      {
        cache: "no-store",
      }
    );
    expect(view?.firstName).toBe("Sam");
  });

  it("reads an unavailable card as not shown, and an address that is no token without asking", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ token: TOKEN, available: false }),
      }))
    );
    await expect(loadSharedCard(TOKEN)).resolves.toBeNull();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(loadSharedCard("../activity/x")).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws when the server cannot tell, for the page to offer Try again", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }))
    );
    await expect(loadSharedCard(TOKEN)).rejects.toThrow("503");
  });
});
