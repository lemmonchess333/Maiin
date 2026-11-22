/**
 * A shared card's page, read without signing in (Soc17 call 1).
 *
 * Hosting sends `/card/<token>` to `sharedCardPage`
 * (functions/lib/sharedCardPage.js), which answers with the website's
 * page and the card in a data block: the card's figures and words as the
 * sharer chose to show them, the sharer's first name and their invite code
 * while it is still theirs. The page reads the block, and when it is not
 * there asks the same function for the card alone.
 * `sharedCardPage.cross.test.ts` holds this reader to what the server
 * writes. Any field the server sends that is not one of these is ignored,
 * and the card is drawn without a route, a photo or a drawing.
 */
import type { ShareCardRenderData } from "@/components/share/ShareCardRenderer";
import type { FinishTone } from "@/lib/finishMoment";
import { normaliseInviteCode } from "@/lib/inviteCode";
import { sharedCardUrl } from "@/lib/publicLinks";
import {
  HIDDEN_FIGURES,
  SHARED_CARD_TOKEN,
  type SharedCardTemplate,
} from "@/lib/sharedCardShare";

/** The data block's id in the page's head. */
export const SHARED_CARD_DATA_ID = "tropos-shared-card";

/** A card as its page draws it, in the sharer's units. */
export interface SharedCardView {
  token: string;
  firstName?: string;
  inviteCode?: string;
  /** The card's figures in a sentence, for a screen reader. */
  summary: string;
  card: ShareCardRenderData;
}

const FIGURES = [
  "distanceKm",
  "durationSec",
  "paceSecPerKm",
  "elevationM",
  "totalVolumeKg",
  "totalReps",
  "exerciseCount",
  "prCount",
  "calories",
  "calorieTarget",
  "protein",
  "carbs",
  "fat",
  "sessionsCount",
  "streakDays",
] as const;

const WORDS = ["headline", "line", "prExercise", "recapTitle"] as const;

const TONES: readonly FinishTone[] = ["achievement", "lifting", "running"];

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function str(value: unknown, max = 200): string | undefined {
  return typeof value === "string" && value && value.length <= max
    ? value
    : undefined;
}

function isTemplate(value: unknown): value is SharedCardTemplate {
  return typeof value === "string" && value in HIDDEN_FIGURES;
}

/** The card's drawing data, or null when it cannot be drawn. */
function readCard(
  raw: unknown,
  firstName: string | undefined
): ShareCardRenderData | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (!isTemplate(c.template)) return null;
  const toggles: Record<string, readonly string[]> = HIDDEN_FIGURES[c.template];
  const hidden = Array.isArray(c.hiddenStats)
    ? c.hiddenStats.filter(
        (key): key is string => typeof key === "string" && key in toggles
      )
    : [];
  const card: ShareCardRenderData = {
    template: c.template,
    format: c.format === "square" ? "square" : "story",
    background:
      c.background === "dark" || c.background === "transparent"
        ? c.background
        : "brand",
    unit: c.unit === "mi" ? "mi" : "km",
    liftUnit: c.liftUnit === "lbs" ? "lbs" : "kg",
    // The sharer's first name, never more (Soc17 call 1).
    handle: firstName ?? "",
    date: str(c.date, 40) ?? "",
    hiddenStats: new Set(hidden),
  };
  for (const key of FIGURES) {
    const value = num(c[key]);
    if (value !== undefined) card[key] = value;
  }
  for (const key of WORDS) {
    const value = str(c[key]);
    if (value) card[key] = value;
  }
  if (TONES.includes(c.tone as FinishTone)) card.tone = c.tone as FinishTone;
  if (Array.isArray(c.splits)) {
    const splits = c.splits.flatMap((s) => {
      const split = (s ?? {}) as Record<string, unknown>;
      const lap = num(split.lap);
      const pace = num(split.paceSecPerKm);
      return lap !== undefined && pace ? [{ lap, paceSecPerKm: pace }] : [];
    });
    if (splits.length) card.splits = splits;
  }
  return card;
}

/**
 * The server's answer for one card: the card, null when it is not shown,
 * or undefined when the answer is not about this card or not an answer.
 */
function readAnswer(
  raw: unknown,
  token: string
): SharedCardView | null | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const answer = raw as {
    token?: unknown;
    available?: unknown;
    view?: unknown;
  };
  if (answer.available === false) {
    return answer.token === token || answer.token === "" ? null : undefined;
  }
  if (answer.available !== true || answer.token !== token) return undefined;
  const v = (answer.view ?? {}) as Record<string, unknown>;
  if (v.token !== token) return undefined;
  const firstName = str(v.firstName, 30);
  const summary = str(v.summary, 400);
  const card = readCard(v.card, firstName);
  if (!card || !summary) return undefined;
  const view: SharedCardView = { token, summary, card };
  if (firstName) view.firstName = firstName;
  const code = normaliseInviteCode(v.inviteCode);
  if (code) view.inviteCode = code;
  return view;
}

/** The block the server put in this page for this card, taken once. */
function takeEmbedded(token: string): SharedCardView | null | undefined {
  if (typeof document === "undefined") return undefined;
  const el = document.getElementById(SHARED_CARD_DATA_ID);
  if (!el) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(el.textContent ?? "");
  } catch {
    return undefined;
  }
  const view = readAnswer(parsed, token);
  if (view !== undefined) el.remove();
  return view;
}

/**
 * The card for its page, or null when it is not shown (which includes an
 * address that is no token). Throws when the server cannot be reached or
 * cannot tell, which the page offers to try again.
 */
export async function loadSharedCard(
  token: string
): Promise<SharedCardView | null> {
  if (!SHARED_CARD_TOKEN.test(token)) return null;
  const embedded = takeEmbedded(token);
  if (embedded !== undefined) return embedded;
  const response = await fetch(`${sharedCardUrl(token)}?format=json`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`shared card answered ${response.status}`);
  const view = readAnswer(await response.json(), token);
  if (view === undefined) throw new Error("shared card answer unreadable");
  return view;
}
