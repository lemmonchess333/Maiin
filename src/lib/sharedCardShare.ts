/**
 * A shared card's own page, the share sheet's side (Soc17 call 1).
 *
 * A card that is not of a public post links to its own unlisted page,
 * `sharedCardUrl(token)`. The token is made on the device when the sheet
 * opens, so the address is in the words at once. Its copy is kept by the
 * `sharedCard` callable (functions/lib/sharedCards.js), started the moment
 * Share is tapped, beside the drawing of the image, and the share sheet
 * waits for it only until `STORE_WAIT_MS` after the tap: the sheet must
 * open within a few seconds of the tap or the browser refuses it.
 *
 * What each share leaves behind:
 * - shared with the card's link: the page stays, and the next share from
 *   the same sheet gets a new token, so a page someone was sent is never
 *   overwritten;
 * - cancelled, sent to Instagram (an image with no words), or shared with
 *   another link because the copy was not kept in time: the copy is taken
 *   back once its store has answered, since no one has its address;
 * - refused because the tap had expired: the copy is kept for the next
 *   tap, which then needs no wait, and taken back if the sheet closes.
 *
 * Nothing here reaches the network: the callables are passed in
 * (`sharedCardCalls.ts`), so the rules are tested on their own.
 */
import type { ShareCardRenderData } from "@/components/share/ShareCardRenderer";
import { sharedCardUrl } from "@/lib/publicLinks";

/** How long after the tap the share sheet waits for the copy to be kept.
 *  Browsers let a share sheet open up to 5 s after a tap (WebKit's and
 *  Chromium's transient activation); the image is drawn inside the same
 *  wait, so most taps add nothing to it. */
export const STORE_WAIT_MS = 2500;

/** 16 random bytes, URL-safe base64 with no padding: 22 characters. The
 *  server's `TOKEN_PATTERN` (functions/lib/sharedCards.js). */
export const SHARED_CARD_TOKEN = /^[A-Za-z0-9_-]{22}$/;

/** A new token: 128 random bits. */
export function newSharedCardToken(
  random: (n: number) => Uint8Array = (n) =>
    crypto.getRandomValues(new Uint8Array(n))
): string {
  let binary = "";
  for (const byte of random(16)) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Each eye toggle and the figures it hides, per template: the server's
 *  `HIDDEN_FIGURES`, pinned to it and to the sheet's toggles by
 *  `sharedCards.cross.test.ts`. A hidden figure never leaves the phone. */
export const HIDDEN_FIGURES = {
  run: {
    distance: ["distanceKm"],
    duration: ["durationSec"],
    pace: ["paceSecPerKm"],
    splits: ["splits"],
    elevation: ["elevationM"],
  },
  lift: {
    volume: ["totalVolumeKg", "totalReps"],
    exercises: ["exerciseCount"],
    duration: ["durationSec"],
    prs: ["prCount", "prExercise"],
  },
  hybrid: {
    liftVolume: ["totalVolumeKg"],
    runDistance: ["distanceKm"],
    totalTime: ["durationSec"],
  },
  nutrition: {
    calories: ["calories", "calorieTarget"],
    macros: ["protein", "carbs", "fat"],
  },
  recap: {
    sessions: ["sessionsCount"],
    runDistance: ["distanceKm"],
    liftVolume: ["totalVolumeKg"],
    streak: ["streakDays"],
  },
} as const satisfies Record<string, Record<string, readonly string[]>>;

export type SharedCardTemplate = keyof typeof HIDDEN_FIGURES;

/** The fields a copy may carry. Not the photo, the route's line, the
 *  session's drawing or the name: the page draws without them. */
const COPIED = [
  "date",
  "headline",
  "line",
  "tone",
  "distanceKm",
  "durationSec",
  "paceSecPerKm",
  "elevationM",
  "splits",
  "totalVolumeKg",
  "totalReps",
  "exerciseCount",
  "prCount",
  "prExercise",
  "calories",
  "calorieTarget",
  "protein",
  "carbs",
  "fat",
  "sessionsCount",
  "streakDays",
  "recapTitle",
] as const satisfies readonly (keyof ShareCardRenderData)[];

type Copied = (typeof COPIED)[number];

/** The card as its page will draw it, as the server keeps it. */
export type SharedCardCopy = Partial<Pick<ShareCardRenderData, Copied>> & {
  template: SharedCardTemplate;
  format: ShareCardRenderData["format"];
  background: ShareCardRenderData["background"];
  unit: ShareCardRenderData["unit"];
  liftUnit: NonNullable<ShareCardRenderData["liftUnit"]>;
  hiddenStats: string[];
};

/** What the card shows, which its copy goes with. */
export interface SharedCardSources {
  postId?: string;
  workoutId?: string;
  runId?: string;
}

function isTemplate(value: string): value is SharedCardTemplate {
  return value in HIDDEN_FIGURES;
}

/**
 * The copy of a card for its page, or null for a card that has no page (an
 * anniversary's). The figures a toggle hid are left out, and so are the
 * photo, the route's line, the drawing and the name.
 */
export function sharedCardCopy(
  data: ShareCardRenderData
): SharedCardCopy | null {
  if (!isTemplate(data.template)) return null;
  const toggles: Record<string, readonly string[]> =
    HIDDEN_FIGURES[data.template];
  const hidden = [...(data.hiddenStats ?? [])]
    .filter((key) => key in toggles)
    .sort();
  const left = new Set(hidden.flatMap((key) => toggles[key]));
  const copy: SharedCardCopy = {
    template: data.template,
    format: data.format,
    background: data.background === "photo" ? "brand" : data.background,
    unit: data.unit,
    liftUnit: data.liftUnit ?? "kg",
    hiddenStats: hidden,
  };
  const out = copy as Record<string, unknown>;
  for (const key of COPIED) {
    const value = data[key];
    if (value !== undefined && value !== "" && !left.has(key)) out[key] = value;
  }
  return copy;
}

/** The outcome of one tap on Share, as the sheet records it. */
export type CardShareOutcome =
  "shared" | "downloaded" | "cancelled" | "failed" | "unused";

export interface CardLinkDeps {
  /** Keep the copy; true once kept. Never rejects. */
  store: (
    token: string,
    copy: SharedCardCopy,
    sources: SharedCardSources
  ) => Promise<boolean>;
  /** Take a kept copy back. */
  remove: (token: string) => Promise<void>;
  makeToken?: () => string;
  now?: () => number;
  waitMs?: number;
  /** Whether the device is online: offline, nothing is tried. */
  online?: () => boolean;
}

/** One tap on Share. */
export interface CardShare {
  /** The card's address once its copy is kept, else `fallback`. */
  link: (fallback: string | undefined) => Promise<string | undefined>;
  /** What became of the share. */
  finish: (outcome: CardShareOutcome) => void;
}

/**
 * A sheet's cards and their pages, for as long as the sheet is open.
 * `begin` at each tap, `close` when the sheet closes.
 */
export function cardLinkSession(deps: CardLinkDeps) {
  const makeToken = deps.makeToken ?? (() => newSharedCardToken());
  const now = deps.now ?? (() => Date.now());
  const waitMs = deps.waitMs ?? STORE_WAIT_MS;
  const online =
    deps.online ??
    (() => typeof navigator === "undefined" || navigator.onLine !== false);

  let token = makeToken();
  // The copy kept, or being kept, under `token`, and what it holds.
  let kept: { key: string; done: Promise<boolean> } | null = null;

  /** A new token for the next share. The old copy is taken back when no
   *  one was given its address. */
  function rotate(takeBack: boolean) {
    const old = { token, done: kept?.done };
    token = makeToken();
    kept = null;
    if (takeBack && old.done) {
      void old.done
        .then((done) => (done ? deps.remove(old.token) : undefined))
        .catch(() => {});
    }
  }

  function begin(
    copy: SharedCardCopy | null,
    sources: SharedCardSources
  ): CardShare {
    const tapAt = now();
    if (!copy || !online()) {
      return { link: async (fallback) => fallback, finish: () => {} };
    }
    const key = JSON.stringify([copy, sources]);
    // Other choices since the last tap: a new token, so one address only
    // ever shows one card.
    if (kept && kept.key !== key) rotate(true);
    if (!kept) {
      const done = deps.store(token, copy, sources).catch(() => false);
      kept = { key, done };
    }
    const mine = { token, done: kept.done };
    let carried = false;
    let finished = false;
    return {
      async link(fallback) {
        const left = Math.max(0, tapAt + waitMs - now());
        let timer: ReturnType<typeof setTimeout> | undefined;
        const done = await Promise.race([
          mine.done,
          new Promise<false>((resolve) => {
            timer = setTimeout(() => resolve(false), left);
          }),
        ]);
        clearTimeout(timer);
        carried = done === true;
        return carried ? sharedCardUrl(mine.token) : fallback;
      },
      finish(outcome) {
        if (finished || mine.token !== token) return;
        finished = true;
        if (carried && (outcome === "shared" || outcome === "downloaded")) {
          // Someone has this address now: its page stays.
          rotate(false);
          return;
        }
        // The tap had expired: the next tap shares the same copy.
        if (outcome === "failed") return;
        rotate(true);
      },
    };
  }

  /** The sheet closed: a copy no one was sent goes. */
  function close() {
    rotate(true);
  }

  return { begin, close };
}
